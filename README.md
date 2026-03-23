# FlashRead RSVP

Upload a document and read in fixed-focus RSVP style.

## Live app
- https://trenn1x.github.io/flashread-rsvp/

## Supported inputs
- PDF (`.pdf`)
- Word (`.docx`)
- Plain text (`.txt`)
- Markdown (`.md`)

## Controls
- Tap left: rewind 10 units
- Tap center: play/pause
- Tap right: forward 10 units
- Swipe right/left on reader: speed up/down
- Slider: direct speed and progress control
- Keyboard: Space (play/pause), Left/Right (rewind/forward), Up/Down (speed)

## Run locally
```bash
cd /Users/thomasverdier/rsvp-reader-app
python3 -m http.server 4173
```
Then open `http://localhost:4173`.

## Sample upload files
- `samples/sample-reading.pdf`
- `samples/sample-reading.txt`
