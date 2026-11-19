from pathlib import Path
import re,json,subprocess
root=Path(r"D:\UltraTVTools\uvideo-tv-v028-work\source\android-tv")
java=(root/"app/src/main/java/ai/ultra/tv/RemoteDebugServer.java").read_text(encoding="utf8")
activity=(root/"app/src/main/java/ai/ultra/tv/UltraTvActivity.java").read_text(encoding="utf8")
js=(root/"app/src/main/assets/tv.js").read_text(encoding="utf8")
css=(root/"app/src/main/assets/tv.css").read_text(encoding="utf8")
assert "private static final long MAX_MS = 15 * 60 * 1000L" in java
assert "private static final int MAX_TRIES = 5" in java
assert "SecureRandom" in java and "random.nextBytes(entropy)" in java
assert "isSameSubnet(client.getInetAddress(), bindAddress)" in java
assert 'req.headers.get("authorization")' in java
assert 'String origin = req.headers.get("origin")' in java
assert "Content-Security-Policy:" in java
assert "onStop()" in activity and "remoteDebugServer.stop()" in activity
assert 'case "remote-debug":' in activity
assert 'data-act="remote-debug"' in js
assert "ultratv://remote-debug" in js
assert "getWebState()" in java and '"/screen"' in java
assert "evaluateJavascript" in java
assert "bindAddress = local;" in java
assert "RemoteDebugServer" in activity
assert "#content .settings-row" in css and "#content .schedule-entry" in css
start=java.index("    private static String dashboard() {")
end=java.index("\n    }\n}",start)
chunk=java[start:end]
strs=re.findall(r'"(?:\\.|[^"\\])*"',chunk)
assert len(strs)>25
html="".join(json.loads(t) for t in strs)
assert "<script>" in html and "</script>" in html
script=html.split("<script>",1)[1].split("</script>",1)[0]
path=Path(r"D:\UltraTVTools\uvideo-tv-v028-work\debug-ui-v028.js")
path.write_text(script,encoding="utf8")
(Path(r"D:\UltraTVTools\uvideo-tv-v028-work\debug-ui-v028.html")).write_text(html,encoding="utf8")
done=subprocess.run(["node","--check",str(path)],capture_output=True,text=True)
assert done.returncode==0,done.stderr
print("REMOTE_SECURITY_STATIC_PASS")
print("DEBUG_HTML",len(html),"JS",len(script),"UI_CONTROLS",html.count("data-k="))
print("SCHEDULE_COMPACT_CSS_PASS")
