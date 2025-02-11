const core = require('@actions/core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = core.getInput('url', { required: true });
const limitRate = core.getInput('limit_rate') || '';
const userAgent = core.getInput('user_agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
const ARCHIVE_DIR = core.getInput('archive_dir') || 'archive';
const METADATA_PATH = path.join(ARCHIVE_DIR, 'metadata.json');
const README_PATH = 'README.md';
const INDEX_PATH = 'index.html';
const repoOwner = process.env.GITHUB_REPOSITORY?.split('/')[0];
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const contactEmail = core.getInput('contact_email') || '';
const githubPagesUrl = `https://${repoOwner}.github.io/${repoName}/`;
const zipDownloadUrl = `https://github.com/${repoOwner}/${repoName}/archive/refs/heads/main.zip`;
const githubIssuesUrl = `https://github.com/${repoOwner}/${repoName}/issues`;
const scheduleDescription = core.getInput('schedule_description') || '';

/**
 * Runs a shell command and returns its output.
 */
function runCommand(command) {
  try {
    return execSync(command, { stdio: 'pipe' }).toString().trim();
  } catch (error) {
    return null;
  }
}

/**
 * Loads or initializes the archive metadata JSON file.
 */
function loadArchiveMetadata() {
  if (fs.existsSync(METADATA_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    } catch (error) {
      core.warning("Error reading metadata.json, initializing a new one.");
    }
  }
  return {};
}

/**
 * Saves the archive metadata JSON file.
 */
function saveArchiveMetadata(metadata) {
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
}

/**
 * Normalizes URLs for subreddit wikis.
 */
function normalizeUrl(url) {
  if (url.startsWith("r/")) {
    const subredditUrl = `https://old.reddit.com/${url}/wiki`;
    core.info(`Converted subreddit URL to wiki: ${subredditUrl}`);
    return { url: subredditUrl, useCurl: true };
  }
  return { url, useCurl: false };
}

/**
 * Checks if a URL is accessible (not returning 404).
 */
function checkUrlStatus(url) {
  const { url: normalizedUrl } = normalizeUrl(url);
  const status = runCommand(`curl -o /dev/null -s -w "%{http_code}" "${normalizedUrl}"`);

  if (!status) {
    core.setFailed(`Critical error: Could not access ${url} (Invalid URL or unreachable)`);
    throw new Error(`Failed to access ${url}`);
  }

  if (status === "404") {
    core.warning(`Skipping ${url} (404 Not Found)`);
    return "404";
  }

  if (status.startsWith("5")) {
    core.setFailed(`Critical error: Could not access ${url} (HTTP ${status})`);
    throw new Error(`Failed to access ${url}`);
  }

  return status;
}

/**
 * Archives subreddit wikis using curl.
 */
function archiveWithCurl(url, archiveDir, userAgent) {
  core.info(`📂 Using curl to archive: ${url}`);

  try {
    const subredditMatch = url.match(/r\/([^/]+)/);
    if (!subredditMatch) {
      core.error(`Could not extract subreddit from URL: ${url}`);
      return null;
    }
    const subreddit = subredditMatch[1];
    const outputDir = path.join(archiveDir, 'reddit');
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${subreddit}.html`);

    execSync(
      `curl -L -A "${userAgent}" --compressed --fail --retry 3 --max-time 30 -b "over18=1" -o "${outputPath}" "${url}"`,
      { stdio: 'inherit' }
    );

    return outputPath;
  } catch (error) {
    core.error(`❌ Archive failure: ${url}, Error: ${error.message}`);
    return null;
  }
}

/**
 * Archives websites using wget.
 */
function archiveWithWget(url, archiveDir, limitRate, userAgent) {
  core.info(`📂 Using wget to archive: ${url}`);

  try {
    const rateLimitOption = limitRate ? `--limit-rate=${limitRate}` : "";
    execSync(
      `wget --mirror --convert-links --adjust-extension --page-requisites --no-parent -e robots=off --random-wait --user-agent="${userAgent}" --no-check-certificate ${rateLimitOption} -P ${archiveDir} ${url}`,
      { stdio: 'inherit' }
    );

    const urlObj = new URL(url);
    const fileName = path.basename(urlObj.pathname);
    const outputPath = fileName && fileName.includes(".")
      ? path.join(archiveDir, `${urlObj.hostname}${urlObj.pathname}`)
      : path.join(archiveDir, urlObj.hostname, 'index.html');

    // Remove any unwanted .orig files.
    execSync(`find ${archiveDir} -name "*.orig" -type f -delete`);
    
    return outputPath;
  } catch (error) {
    core.error(`❌ Archive failure: ${url}, Error: ${error.message}`);
    return null;
  }
}

/**
 * Chooses the correct archiving method based on the URL.
 */
function archiveWebsite(url, archiveDir, limitRate, userAgent) {
  const { useCurl } = normalizeUrl(url);
  if (useCurl) {
    return archiveWithCurl(url, archiveDir, userAgent);
  } else {
    return archiveWithWget(url, archiveDir, limitRate, userAgent);
  }
}

/**
 * Updates or creates README.md.
 */
function updateReadme(metadata) {
  let readmeContent = "";
  
  if (fs.existsSync(README_PATH)) {
    readmeContent = fs.readFileSync(README_PATH, 'utf8');
  }

  let tableRows = Object.entries(metadata)
    .map(([url, data]) => {
      const status = data.lastArchived === "FAILED" ? "❌ FAILED" : data.lastArchived;
      return `| [${url}](${data.archivedPath || '#'}) | ${status} |`;
    })
    .join("\n");

  let newReadme = `# Web Archive

This repository contains archived copies of various websites.

## **Accessing the Archive**
### Online, no download required
[View the archive](${githubPagesUrl})

### Locally
[Download ZIP](${zipDownloadUrl}) and extract the contents. Open \`index.html\` in your browser to navigate the archive.

## **Archived Websites**
| Website | Description | Last Successful Archive |
|---------|------------|-------------------------|
${tableRows}

## **Mirroring**
If you'd like to create a mirror of this archive, simply fork this repository or download the archive.

## **Contact**
If you have any questions, feel free to open an issue on [GitHub](${githubIssuesUrl}).${contactEmail ? ` Or you can [send an email](mailto:${contactEmail}).` : ""}
  `;

  fs.writeFileSync(README_PATH, newReadme);
}

/**
 * Updates or creates index.html.
 */
function updateIndex(metadata) {
  let indexContent = "";
  
  if (fs.existsSync(INDEX_PATH)) {
    indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
  }

  let tableRows = Object.entries(metadata)
    .map(([url, data]) => {
      const status = data.lastArchived === "FAILED" ? "❌ FAILED" : data.lastArchived;
      return `<tr><td><a href="${data.archivedPath || '#'}">${url}</a></td><td>${status}</td></tr>`;
    })
    .join("\n");
    
  let newIndex = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Archived Websites</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            line-height: 1.6;
            max-width: 800px;
        }
        h1, h2 {
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f4f4f4;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>

    <h1>Archived Websites</h1>
    <p>${scheduleDescription}</p>

    <h2>Accessing the Archive</h2>
    <p><strong>Online, no download required:</strong> <a href="${githubPagesUrl}">${githubPagesUrl}</a></p>
    <p><strong>Locally:</strong> <a href="${zipDownloadUrl}">Download ZIP</a> and extract the contents.</p>

    <h2>List of Archived Websites</h2>
    <table>
        <tr>
            <th>Website</th>
            <th>Description</th>
            <th>Last Successful Archive</th>
        </tr>
        ${tableRows}
    </table>

    <h2>Contact</h2>
    <p>If you have questions, open an issue on <a href="${githubIssuesUrl}">GitHub</a>.${contactEmail ? ` Or you can <a href="mailto:${contactEmail}">send an email</a>.` : ""}</p>

</body>
</html>`;

  fs.writeFileSync(INDEX_PATH, newIndex);
}

/**
 * Main function that executes the archiving process.
 */
async function run() {
  try {
    // Get the single URL artifact (the only required input).

    // Ensure the archive directory exists.
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    // Load any existing metadata.
    let metadata = loadArchiveMetadata();

    core.info(`🔍 Validating URL: ${url}`);
    const status = checkUrlStatus(url);
    if (status === "404") {
      core.warning(`URL ${url} returned 404. Skipping archiving.`);
      return;
    }

    core.info("✅ URL is valid. Proceeding with archiving...");

    // Archive the website using the appropriate method.
    let archivedPath = archiveWebsite(url, ARCHIVE_DIR, limitRate, userAgent);
    let archiveDate = new Date().toISOString().split("T")[0];

    if (archivedPath) {
      metadata[url] = { lastArchived: archiveDate, archivedPath };
      core.info(`✅ Successfully archived: ${url} → ${archivedPath}`);
    } else {
      metadata[url] = { lastArchived: "FAILED", archivedPath: null };
      core.warning(`⚠️ Archive attempt failed for ${url}`);
    }

    // Save the updated metadata and refresh README/index.
    saveArchiveMetadata(metadata);
    updateReadme(metadata);
    updateIndex(metadata);
  } catch (error) {
    core.setFailed(`🚨 Action failed: ${error.message}`);
  }
}

run();