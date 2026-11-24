# Mohamed Firas Yazidi — Portfolio MVP (`firasyazidi.github.io`)

Obsidian Split-Screen personal portfolio built with zero framework bloat (pure HTML, CSS, ES modules, and JSON data files) — ready for GitHub Pages.

## Preview Locally

```powershell
cd portfolio
python -m http.server 8080
```

Open `http://127.0.0.1:8080/`.

## Add a New Flagship Project in 30 Seconds

Edit `data/projects.json` and update any slot (or append a new object):

1. Set `"status": "live"`
2. Fill `"code_url": "https://github.com/Firasyazidi/<your-repo>"`
3. Fill `"demo_url": "https://..."` (or `"./demos/<your-demo>/"`)
4. Update `"metrics"` with your real verified benchmark numbers and `"adr"` with your key architecture trade-off.

Both the **`Code`** and **`Live Demo`** buttons activate automatically.

## Deploy to GitHub Pages (`https://firasyazidi.github.io`)

1. Create a public repository named `firasyazidi.github.io` on GitHub (`https://github.com/new`).
2. Inside `portfolio/`, run:
   ```powershell
   git init
   git add .
   git commit -m "Launch Obsidian Split-Screen portfolio MVP"
   git branch -M main
   git remote add origin https://github.com/Firasyazidi/firasyazidi.github.io.git
   git push -u origin main
   ```
3. In GitHub **Settings → Pages → Source**, select **GitHub Actions**. Your portfolio goes live at `https://firasyazidi.github.io`.
