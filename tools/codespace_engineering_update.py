"""Run level 2 against an existing private FreeLLMAPI Codespace, without exporting keys."""
import argparse
import base64
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

import engineering_update as update


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("codespace", help="Name from gh codespace list")
    parser.add_argument("--project", choices=(*update.PROJECTS, "all"), default="all")
    parser.add_argument("--model", default="auto")
    parser.add_argument("--output", type=Path, default=Path("build/engineering/lab-guides.json"))
    args = parser.parse_args()
    paths = {"tools/engineering_update.py", "src/data/lab-guides.json"}
    for project in update.PROJECTS.values():
        paths.update(project[1:])
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(paths):
            bundle.write(update.ROOT / path, path)
    payload = json.dumps([base64.b64encode(archive.getvalue()).decode(), args.project, args.model])
    script = "payload = " + repr(json.loads(payload)) + "\n" + REMOTE
    result = subprocess.run(["gh", "codespace", "ssh", "-c", args.codespace, "--", "python3 -"],
                            input=script.encode(), stdout=subprocess.PIPE, check=True, timeout=660)
    batch = json.loads(result.stdout)
    for project in update.PROJECTS if args.project == "all" else [args.project]:
        guide = batch[project]
        update.validate({field:guide[field] for field in update.FIELDS})
        if guide["source_sha256"] != update.evidence(project)[2]:
            raise ValueError("Evidence changed during drafting: " + project)
    update.atomic(args.output, json.dumps(batch, ensure_ascii=False, indent=2) + "\n")
    print(args.output)


REMOTE = """
import base64, io, json, os, pathlib, signal, sqlite3, subprocess, sys, tempfile, time, zipfile
from urllib.request import Request, urlopen
roots = list(pathlib.Path('/workspaces').glob('*/freellmapi/server/data/freeapi.db'))
if len(roots) != 1:
    sys.exit('Expected one configured FreeLLMAPI checkout in /workspaces.')
db_path = roots[0]
server = db_path.parents[1]
db = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)
token = db.execute("select value from settings where key='unified_api_key'").fetchone()[0]
db.close()
endpoint = 'http://127.0.0.1:3001/v1'
probe = Request(endpoint + '/models', headers={'Authorization':'Bearer ' + token})
def ready():
    try:
        with urlopen(probe,timeout=4) as res: return res.status == 200
    except OSError: return False
process = None
try:
    if not ready():
        process = subprocess.Popen([server.parent/'node_modules/.bin/tsx','src/index.ts'],cwd=server,
                                   env=dict(os.environ,HOST='127.0.0.1',PORT='3001'),stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL,start_new_session=True)
        for _ in range(20):
            if ready(): break
            if process.poll() is not None: sys.exit('The local FreeLLM service could not start.')
            time.sleep(1)
        else: sys.exit('FreeLLM did not become ready.')
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(payload[0]))) as bundle: bundle.extractall(directory)
        child=subprocess.run([sys.executable,'tools/engineering_update.py','--level','2','--project',payload[1],'--model',payload[2]],
                             cwd=directory,env=dict(os.environ,FREELLM_API_KEY=token,FREELLM_BASE_URL=endpoint),stdout=sys.stderr)
        if child.returncode: sys.exit(child.returncode)
        print((pathlib.Path(directory)/'build/engineering/lab-guides.json').read_text())
finally:
    if process is not None and process.poll() is None: os.killpg(process.pid, signal.SIGTERM)
"""


if __name__ == "__main__":
    main()
