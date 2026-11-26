#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
邮件投递（经 MCP 邮件连接器直连）。解决三个卡点：
  1) 部分连接器返回【纯 JSON】而非 SSE —— 照搬 SSE 解析会把响应静默丢弃，
     进而把「已发送」误判成失败，重复发送。本模块两种都兼容。
  2) 附件必须 base64 内联 —— 放进对话上下文会撑爆，必须脚本内直发。
  3) 参数名易错：ListMessages 用 dir（不是 folder）且必须带 alias_id。

连接器名：默认取环境变量 MAIL_CONNECTOR_NAME，未设时用 "qq-mail"。
**换环境时务必改成你本机 CODEBUDDY_MCP_CONFIG 里实际的连接器名**，否则连不上。

用法：
  python mail.py send --to a@b.com --subject "主题" --body "正文" [--attach f.pdf ...]
  python mail.py ls  [--dir sent|inbox] [--limit 10]
  python mail.py check --subject "关键词"      # 核对是否已发出（发信前/后都可用）
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import time

import requests

MAX_ATTACH_BYTES = 1024 * 1024  # QQ 邮箱连接器单附件上限约 1MB，超出会被拒


class QQMail:
    def __init__(self, server=None):
        server = server or os.environ.get("MAIL_CONNECTOR_NAME", "qq-mail")
        cfg = json.loads(os.environ["CODEBUDDY_MCP_CONFIG"])["mcpServers"][server]
        self.url = cfg["url"]
        self.h = dict(cfg.get("headers", {}))
        self.h.update({"Content-Type": "application/json; charset=utf-8",
                       "Accept": "application/json, text/event-stream"})
        self.s = requests.Session()
        self._id = 0
        self._rpc("initialize", {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "wb-agent", "version": "1.0"}})

    def _rpc(self, method, params, timeout=60):
        self._id += 1
        r = self.s.post(self.url, headers=self.h,
                        data=json.dumps({"jsonrpc": "2.0", "id": self._id,
                                         "method": method, "params": params},
                                        ensure_ascii=False).encode("utf-8"),
                        timeout=timeout)
        r.encoding = "utf-8"
        return r

    def call(self, name, args, timeout=300):
        r = self._rpc("tools/call", {"name": name, "arguments": args}, timeout)
        txt = r.text or ""
        if "data:" in txt:                      # SSE 兼容
            txt = "".join(l[5:] for l in txt.split("\n") if l.startswith("data:"))
        try:
            j = json.loads(txt)
        except Exception:
            return {"_err": "bad json", "raw": txt[:400]}
        if "error" in j:
            return {"_err": j["error"]}
        res = j.get("result", {})
        c = res.get("content", [])
        if res.get("isError"):
            return {"_err": c[0].get("text", "") if c else "unknown"}
        if not c:
            return {"_empty": True, "result": res}
        t = c[0].get("text", "")
        try:
            return json.loads(t)
        except Exception:
            return {"_text": t}

    @staticmethod
    def unwrap(res):
        d = res
        for _ in range(4):
            if isinstance(d, dict) and isinstance(d.get("data"), dict):
                d = d["data"]
            else:
                break
        return d if isinstance(d, dict) else res

    def alias(self):
        me = self.unwrap(self.call("GetMe", {}))
        return (me.get("aliases") or [{}])[0].get("alias_id"), me

    def send(self, to, subject, body, attachments=(), cc=None):
        aid, me = self.alias()
        # 坑（都实测踩过）：
        #   to / cc 必须是「对象数组」[{email,name?}]，传字符串或字符串数组都会报
        #   check input schema type error field_name: to schema_type: object
        #   attachments 每项必须同时有 filename/content_type/content(base64)/size/sha1
        lim = (me.get("constraints") or {}).get("max_attachment_size_bytes", MAX_ATTACH_BYTES)

        def rcpts(x):
            if x is None:
                return None
            if isinstance(x, str):
                x = [x]
            return [r if isinstance(r, dict) else {"email": r} for r in x]

        payload = {"alias_id": aid, "to": rcpts(to), "subject": subject, "body": body,
                   "skip_confirmation": True}
        if cc:
            payload["cc"] = rcpts(cc)
        atts = []
        for p in attachments:
            raw = open(p, "rb").read()
            if len(raw) > lim:
                return {"_err": "附件 %s 为 %.2f MB，超过连接器上限 %.2f MB"
                                % (os.path.basename(p), len(raw) / 1048576, lim / 1048576)}
            atts.append({"filename": os.path.basename(p),
                         "content_type": mimetypes.guess_type(p)[0] or "application/octet-stream",
                         "content": base64.b64encode(raw).decode(),
                         "size": len(raw),
                         "sha1": hashlib.sha1(raw).hexdigest()})
        if atts:
            payload["attachments"] = atts
        return self.call("SendMessage", payload)

    def list_dir(self, d="inbox", limit=10):
        aid, _ = self.alias()
        r = self.call("ListMessages", {"alias_id": aid, "dir": d, "limit": limit})
        u = self.unwrap(r)
        # 坑：返回体是 {"data": {"data": [ ...邮件... ]}}，解包后邮件数组在 data 键，
        # 不是 messages。两个键都要兼容，否则会误报「0 封」而看漏已发出的信。
        msgs = u.get("messages") or u.get("data") or []
        return msgs if isinstance(msgs, list) else []


def cmd_send(a):
    m = QQMail()
    res = m.send(a.to, a.subject, a.body or "", a.attach or [])
    if res.get("_err"):
        print("FAIL:", res["_err"]); sys.exit(1)
    print("已提交:", json.dumps(res, ensure_ascii=False)[:300])
    # 关键：发完务必回查，避免「其实成功了却当成失败再发一遍」
    for _ in range(8):
        time.sleep(6)
        got = [x for x in m.list_dir("sent", 20) if a.subject[:12] in (x.get("subject") or "")]
        if got:
            print("已确认落库（sent），主题匹配 %d 封：" % len(got))
            for x in got:
                print("   ", x.get("sent_at") or x.get("date"), "|", x.get("subject"),
                      "| att=", x.get("has_attachments"))
            return
    print("未在 60s 内确认，请手动核对『已发送』。")


def cmd_ls(a):
    m = QQMail()
    for x in m.list_dir(a.dir, a.limit):
        print("%s | %s | att=%s" % (x.get("sent_at") or x.get("date") or x.get("received_at"),
                                    (x.get("subject") or "")[:60], x.get("has_attachments")))


def cmd_check(a):
    m = QQMail()
    for d in ("sent", "inbox"):
        msgs = m.list_dir(d, 30)
        hit = [x for x in msgs if a.subject in (x.get("subject") or "")]
        print("[%s] 共 %d 封，匹配 %d 封" % (d, len(msgs), len(hit)))
        for x in hit:
            print("   ", x.get("sent_at") or x.get("date"), "|", x.get("subject"),
                  "| att=", x.get("has_attachments"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("send"); s.add_argument("--to", required=True); s.add_argument("--subject", required=True)
    s.add_argument("--body", default=""); s.add_argument("--attach", nargs="*"); s.set_defaults(fn=cmd_send)
    l = sub.add_parser("ls"); l.add_argument("--dir", default="inbox"); l.add_argument("--limit", type=int, default=10)
    l.set_defaults(fn=cmd_ls)
    c = sub.add_parser("check"); c.add_argument("--subject", required=True); c.set_defaults(fn=cmd_check)
    a = ap.parse_args()
    a.fn(a)
