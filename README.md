# Web Artifact Archiver

[![GitHub release](https://img.shields.io/github/v/release/AnnaLogButterfly/web-artifact-archiver)](https://github.com/AnnaLogButterfly/web-artifact-archiver/releases)

A reusable GitHub Actions **JavaScript action** that archives a single web artifact—such as a full website, a file URL, or a **subreddit wiki**—and tracks its history over time. This action:

- **Downloads and archives websites** using `wget` (for general websites) or `curl` (for Reddit wikis) and saves them in a structured `archive/` folder.
- **Automatically generates correct links** to the archived copies, so that even if the original URL changes, the archived content remains accessible.
- **Records the last successful archive date** for each URL, preserving historical data in `archive/metadata.json` even if a subsequent archive attempt fails.
- **Dynamically regenerates a `README.md` and an interactive `index.html`** listing all archived items, along with details like the archive date and optional descriptions.
- **Commits the changes** back to the repository, and (optionally) can deploy the content to GitHub Pages for online browsing.

---

## How the Action Works

This action is designed to archive **one web artifact per run**. It intelligently determines the correct tool based on the provided URL:

- **General Websites:**  
  Uses `wget` to mirror the entire site (including CSS, images, JavaScript, etc.) and saves the content in a folder named after the website’s domain.
  
- **Subreddit Wikis:**  
  Uses `curl` (with an age-confirmation cookie) to download Reddit wiki pages—since Reddit blocks `wget` in many cases.
  
- **Error Handling:**  
  - If the target URL returns a 404, the action logs a warning and skips archiving.
  - For other critical errors (e.g., server errors, network issues), the action fails, but previously successful archives remain intact.
  
After processing the URL, the action:
  
1. Updates `archive/metadata.json` with the current archive date and file path.
2. Regenerates the `README.md` and `index.html` files to document the current state of the archive.
3. Commits these changes to the repository.

---

## Configurable Options

| Input           | Description                                                                                             |
|-----------------|---------------------------------------------------------------------------------------------------------|
| `url`           | **(Required)** The URL of the web artifact to archive.                                                 |
| `archive_dir`   | The directory where the archives are stored. Defaults to `archive`.                                     |
| `limit_rate`    | Optional rate limit for downloads (e.g., `10m` for 10MB/s).                                             |
| `user_agent`    | Sets the User-Agent string for wget/curl requests. Defaults to a Chrome user agent if not specified.    |
| `schedule`      | A descriptive text for the update schedule (e.g., `"Weekly on Fridays at midnight (UTC)"`).             |
| `contact_email` | Optional email address that is included in the generated documentation for contact purposes.           |

---

## Usage Example

To incorporate this action into your repository, create a workflow file (for example, `.github/workflows/archive.yml`) with content similar to the following:

```yaml
name: Archive Web Artifact

on:
  # Trigger on a schedule and/or manually.
  schedule:
    - cron: '0 0 * * 5'  # Runs every Friday at midnight (UTC)
  workflow_dispatch:

permissions:
  contents: write  # Allows the action to commit changes back to the repository

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Web Artifact Archiver Action
        uses: AnnaLogButterfly/web-artifact-archiver@v2
        with:
          url: "https://example.com"
          schedule: "Weekly on Fridays at midnight (UTC)"
          contact_email: "your-email@example.com"  # Optional
          limit_rate: "10m"                         # Optional
          # If omitted, the action defaults to a Chrome user agent.
          user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
```

---

## Usage

This repository contains a JavaScript action that you can incorporate into your own GitHub Actions by referencing it. The action accepts a JSON array for the artifacts input. Each object in the JSON array should include a `"url"` property and may optionally include a `"description"`. Additionally, you can provide a static description that will appear at the top of the generated README.

### Final Notes
To use the action, create a workflow file (e.g., `.github/workflows/archive.yml`) with the following content:

```yaml
name: Archive Artifacts

on:
  # Trigger on a schedule and/or manually.
  schedule:
    - cron: '0 0 * * 5'  # Runs every Friday at midnight (UTC)
  workflow_dispatch:

permissions:
  contents: write  # Required to allow pushing commits

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Web Archiver Action
        uses: AnnaLogButterfly/web-artifact-archiver@v2
        with:
          # Provide a JSON array of artifact objects. Each object must include a "url" and may include a "description".
          artifacts: |
            [
              { "url": "https://example.com", "description": "Example website" },
              { "url": "r/AskReddit", "description": "Subreddit Wiki for AskReddit" },
              { "url": "https://example.com/file.pdf", "description": "Sample PDF document" }
            ]
          schedule: "Weekly on Fridays at midnight (UTC)"
          contact_email: "your-email@example.com"  # Optional email contact
          limit_rate: "10m"  # Optional rate limit for downloads (10MB/s)
          user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" # Optional
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Permissions Requirement
By default, GITHUB_TOKEN has read-only access when running in another repository.
To allow the action to push commits, you must explicitly grant it write permissions in your workflow:

```yaml
permissions:
  contents: write
```
Without this, Git operations (like commits and pushes) will fail with a 403 error.

## Alternative: Using a Personal Access Token (PAT)

If you’re running this action in a repository where you cannot modify permissions, you can use a Personal Access Token (PAT) instead.

### 1. Generate a PAT
	•	Go to GitHub → Settings → Developer Settings → Personal Access Tokens.
	•	Click “Generate new token”.
	•	Enable these scopes:
	•	✅ repo (Full control of repositories)
	•	✅ workflow (Access GitHub Actions)

### 2. Add the PAT as a Repository Secret
	•	Go to Settings → Secrets and Variables → Actions.
	•	Click “New repository secret”.
	•	Name it PAT_TOKEN.
	•	Paste the copied PAT.

### 3. Update the Workflow

Modify the workflow to use the PAT instead of GITHUB_TOKEN:

```yaml
jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Web Archiver Action
        uses: AnnaLogButterfly/web-artifact-archiver@v2
        with:
          artifacts: '[{"url": "https://example.com", "description": "Example website"}]'
          schedule: "Weekly on Fridays at midnight (UTC)"
          static_description: "Backup of web resources."
          github_token: ${{ secrets.PAT_TOKEN }}  # Use PAT instead of GITHUB_TOKEN
```

## Final Notes

✅ If you own the repository, updating permissions: contents: write is the best approach.

✅ If you’re running this in a third-party or organization-managed repository, using a PAT is a reliable alternative.