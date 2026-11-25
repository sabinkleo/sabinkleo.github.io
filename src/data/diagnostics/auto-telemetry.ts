import type { Diagnostic } from './types';

export default {
  "slug": "auto-telemetry",
  "title": "ECU calibration & dyno telemetry",
  "name": "Automotive telemetry",
  "description": "Align dyno pulls with FTManager exports so a calibrator can review map changes against measured traces.",
  "command": "pull compare run-07 run-08",
  "lines": [
    "RPM        3200    4000    4800",
    "AFR        13.1    12.3    12.0",
    "boost kPa    18      42      58",
    "knock ct      0       0       1",
    "timing °     17      15      13",
    "FTManager diff   2 cells changed",
    "review           timestamp offset"
  ],
  "stages": [
    {
      "when": "Before the session",
      "artifact": "Channel manifest",
      "detail": "Document units, fuel type, sensor calibration and ECU timebase alongside the dyno export."
    },
    {
      "when": "Session day",
      "artifact": "Aligned pull overlays",
      "detail": "Match RPM landmarks across logs. Plot AFR, boost, knock and ignition against the same axis with missing samples marked."
    },
    {
      "when": "Next working day",
      "artifact": "Map review bundle",
      "detail": "Pair each pull with its FTManager revision, annotated cell diff and baseline backup for calibrator review."
    }
  ],
  "questions": [
    {
      "label": "Do both loggers share a verified time reference?",
      "gap": "Trace alignment",
      "fix": "Match a recorded RPM transition and document the time offset."
    },
    {
      "label": "Are sensor units and calibration dates recorded?",
      "gap": "Sensor provenance",
      "fix": "Attach the channel manifest and calibration record to the pull."
    },
    {
      "label": "Can each pull be traced to one FTManager map?",
      "gap": "Map provenance",
      "fix": "Archive the exported map and checksum beside its pull log."
    },
    {
      "label": "Can the calibrator inspect missing or clipped samples?",
      "gap": "Trace integrity",
      "fix": "Flag gaps and saturation before comparing overlays."
    }
  ]
} satisfies Diagnostic;
