# CRM Vértice

The static route uses Appwrite account sessions and TablesDB for access control and persistence. It starts with an empty configuration. Only deployment identifiers belong in config.json.

## Configure the existing Appwrite project

1. Attach a same-site HTTPS API domain under verticelabs.me and register verticelabs.me as a Web platform. Keep session cookies on the API host. Set endpoint to the HTTPS API URL ending in /v1.
2. Provision an operator account and a dedicated CRM team. Add only approved operators to the team.
3. Create a dedicated table with required text columns named lead and state. Size each for the corresponding serialized JSON and expected contact history. Disable row security and grant the CRM team only table Read, Create, and Update. Clear Any, Users, guests and all other broad permissions. Enter the project, database and table IDs in config.json.
4. With synthetic records first, confirm an unsigned request and a signed-in account outside the team cannot list, create, or update rows. Confirm a team member can create a record, edit the pipeline, reload, export, sign out and lose access. Verify Chrome on Android before adding commercial data.

## Import

Run prepare-import.py against the private commercial archive and optionally pass the existing Prospector sales-queue ZIP using --sales-queue. The output is a private JSON file. Open the signed-in CRM and select it under Importar leads. Keep source archives, exports and the generated import outside the repo.

The import uses the archive's canonical lead ID. Deterministic row IDs and create-only writes preserve pipeline state on retries. A partial import can be retried with the same file. JSON and CSV exports contain the lead and state fields. The CSV stores each field as quoted JSON to preserve nested evidence, hypotheses and history.

The confirmed contacts sort first. Authorities and source links may differ from historical records. Candidate decision groups stay attached to individual locations. Notes, follow-up, sales stage and values are saved on the same row. V1 is for one operator working from one session at a time. Concurrent edits to a single row can overwrite one another.

## Hypotheses

The optional import carries provenance-labeled drafts from the existing private queue. The page displays them in the hypotheses section. Run any provider generation through the existing private Prospector workflow. The browser uses no provider credentials or inference endpoint. Live generation and synchronization are outside this change.
