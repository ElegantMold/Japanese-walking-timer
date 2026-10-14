# Japanese Walking Timer

A small iPhone-friendly timer for the Japanese Walking Method.

## Routine

- 5 minute warmup
- 3 minutes brisk walking
- 3 minutes casual walking
- Repeat the brisk/casual intervals for 30 minutes
- Start cooldown and keep running until stopped manually

## Run Locally

From this folder:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173` on your Mac, or open the Mac's local network address from your iPhone browser while both devices are on the same Wi-Fi.

## Add To iPhone Home Screen

1. Open the app in your iPhone browser.
2. Tap Share.
3. Tap Add to Home Screen.
4. Start it from the new home screen icon.

Keep the phone volume on and use the Test Guidance button before starting. The routine plays as a continuous guidance track, so its final-five-second beeps and spoken interval directions continue when an iPhone screen is locked. Lock-screen media controls can pause and resume the routine.

Finishing all 35 scheduled minutes automatically marks that date on the in-app walking calendar. History is stored locally on the device.

## Regenerate The Guidance Track

The deployed `routine-guidance-compact.wav` is a 4000 Hz PCM copy for smaller download size. The generator creates the 8000 Hz source `routine-guidance.wav`; downsample a copy for deployment. It can be regenerated after changing the routine timing or prompts:

```sh
npm install
npm run generate-audio
```

## Publish With GitHub Pages

GitHub Pages gives this app a public HTTPS address so it can be opened on an iPhone over cell data. For a simple personal static site like this, GitHub Pages is free.

1. Create a new GitHub repository.
2. Upload all files from this folder.
3. Open the repository settings.
4. Go to Pages.
5. Set the source to deploy from the default branch and the root folder.
6. Open the Pages URL on your iPhone.
7. Use the browser's Share button to Add to Home Screen.

After the app has loaded once from GitHub Pages, it saves its core files for offline use. Open it once before heading out to confirm it is ready.
