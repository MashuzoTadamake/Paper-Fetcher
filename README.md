# Paper Fetcher

> **The fastest, cleanest way to find and download academic papers with organized filenames.**

**Paper Fetcher** is a lightweight, high-performance browser extension (Manifest V3) for Chromium browsers (Brave, Chrome, Edge, Opera, Vivaldi). It extracts metadata from academic publisher pages, probes multiple Sci-Hub mirrors concurrently in parallel, and downloads verified PDFs directly to your computer with clean, standardized academic filenames.

---

## What Does It Do?

* **Parallel Mirror Racing:** Instead of relying on a single mirror that might be blocked or offline, it queries all active mirrors simultaneously. The fastest live mirror wins instantly.
* **Smart Academic Filenames:** No more files named `10.1016@j.ipm.2022.103061.pdf` or random hashes. Papers are automatically saved as:
  ```text
  Author et al - (Year) - Paper Title.pdf
  ```
* **Zero-HTML Safety Guard:** Many extensions accidentally trigger downloads on error pages or paywalls, leaving you with useless `.html` files. Paper Fetcher inspects the file's binary magic bytes (`%PDF-`) before initiating any download. If a paper isn't available, it cleanly tells you instead of downloading garbage.
* **Deep Metadata Extraction:** Automatically detects DOIs, ScienceDirect PIIs, titles, and authors across ScienceDirect, IEEE Xplore, Nature, Springer, Wiley, ACM, and more.
* **100% Private & Client-Side:** No external servers, no tracking, no accounts, and no background bloat. Everything runs locally in your browser.

---

## Installation (Quick 2-Minute Setup)

Because this is an open-source extension, you install it directly in developer mode:

### 1. Download the Extension
* **Option A (Git):**
  ```bash
  git clone https://github.com/MashuzoTadamake/Paper-Fetcher.git
  ```
* **Option B (ZIP):** Download the repository as a `.zip` file from GitHub and extract the folder to your computer.

### 2. Load it into your Browser
1. Open your browser's extension manager:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
2. Turn on **Developer mode** (toggle located in the top-right corner).
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`Paper extract extension folder`** (the folder containing `manifest.json`).
5. *(Recommended)* Pin **Paper Fetcher** to your browser toolbar so it is always accessible.

---

## How to Use

Using Paper Fetcher takes just two clicks:

```text
Browse to Paper  -->  Click Extension Icon  -->  Click "Download PDF"
```

1. **Browse to any research paper:**
   Visit any journal article or publisher page (e.g. ScienceDirect, Nature, IEEE Xplore, SpringerLink).
2. **Open the extension popup:**
   Click the **Paper Fetcher** icon in your browser toolbar.
   - The extension will instantly extract the paper's title, authors, year, and DOI.
   - It will automatically race live mirrors to check for paper availability.
3. **Choose what you want to do:**
   * **Download PDF:** Verifies the PDF stream and downloads the paper directly to your `Downloads` folder with a formatted academic name.
   * **Open in Sci-Hub:** Opens the fastest live mirror directly in a new browser tab.

---

## What if a Paper Isn't on Sci-Hub?

If a paper is brand new or not mirrored in Sci-Hub's database:
* The extension will display: `Not on Sci-Hub :3`
* The **Download PDF** button is safely disabled so you never get stuck with a broken `.html` download.
* You can still view the extracted metadata and copy the DOI for your bibliography.

---

## In-Popup Settings

Click the **Settings** button inside the popup to:
* View the list of active Sci-Hub mirrors (`sci-hub.ee`, `sci-hub.ru`, `sci-hub.st`, `sci-hub.su`, `sci-hub.al`, etc.).
* Run a live **latency ping test** to check which mirrors are currently fastest on your network.
* Adjust your download preferences.

All settings open directly inside the popup interface—no extra browser tabs or clutter.

---

## Disclaimer

This extension is an open-source client-side metadata extractor and research utility created strictly for educational, interoperability, and personal research reference. Users are responsible for complying with the terms of use of third-party platforms and their local regulations.
