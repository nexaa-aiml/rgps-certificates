const DATA_URL = "data.json";
const CERTIFICATE_BASE = "certificates/"; // Adjust this if your images folder is named differently

const form = document.getElementById("certificate-form");
const input = document.getElementById("regd-number");
const statusBox = document.getElementById("status");
const submitButton = form ? form.querySelector("button") : null;

// Verification specific elements
const verificationPanel = document.getElementById("verification-panel");
const verificationResult = document.getElementById("verification-result");
const pageTitle = document.getElementById("page-title");
const pageIntro = document.getElementById("page-intro");

let certificateIndex = null;

const normalizeRegd = (value) => value.trim().toUpperCase();

const encodePath = (path) =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const setStatus = (message, type = "") => {
  if (statusBox) {
    statusBox.textContent = message;
    statusBox.className = `status${type ? ` ${type}` : ""}`;
  }
};

async function loadCertificates() {
  if (certificateIndex) {
    return certificateIndex;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load certificate data (${response.status}).`);
    }

    const rawData = await response.json();
    const normalized = new Map();
    const byUuid = new Map(); // Store by UUID for verification

    Object.entries(rawData).forEach(([key, value]) => {
      const normalizedKey = normalizeRegd(key);
      // Ensure we store the regd number in the object for easy access during verification
      if (!value.regd) {
        value.regd = key;
      }
      
      normalized.set(normalizedKey, value);

      // Also map by UUID if it exists
      if (value && value.uuid) {
        byUuid.set(value.uuid, value);
      }
    });

    certificateIndex = { byRegd: normalized, byUuid: byUuid };
    return certificateIndex;
  } catch (error) {
    throw error;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function downloadCertificate(record, regdNumber) {
  try {
    setStatus("Downloading certificate...", "loading");
    // If the JSON contains a specific certificate path, use it. Otherwise, build it from the UUID
    const fileName = record.certificate || `${record.uuid}.jpeg`;
    const filePath = `${CERTIFICATE_BASE}${fileName}`;
    const downloadUrl = encodePath(filePath);
    
    // Fetch as blob to force a download instead of opening in a new tab,
    // and to properly catch 404 errors on static hosts like GitHub Pages
    const response = await fetch(downloadUrl);
    if (!response.ok) {
        if (response.status === 404) {
             throw new Error("Certificate file not found on the server. Make sure it has been uploaded.");
        }
        throw new Error(`Server returned ${response.status}`);
    }
    
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName.split("/").pop();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    setStatus("");
  } catch (error) {
    console.error("Download error:", error);
    setStatus("Failed to download certificate: " + error.message, "error");
  }
}

function renderVerificationResult(record) {
  form.classList.add("hidden");
  statusBox.classList.add("hidden");
  verificationPanel.classList.remove("hidden");
  
  pageTitle.textContent = "Certificate Verification";
  pageIntro.textContent = "The results of the QR code scan are below.";

  if (record) {
    verificationResult.innerHTML = `
      <div class="verification-icon valid">✓</div>
      <h2 style="margin:0; font-size:1.8rem;">Valid Certificate</h2>
      <p style="color:var(--muted); margin-top:8px;">This certificate is authentic and verified.</p>
      
      <div class="verification-details">
        <div class="detail-row">
          <span class="detail-label">Participant Name</span>
          <span class="detail-value">${record.name || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Registration Number</span>
          <span class="detail-value">${record.regd || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Department</span>
          <span class="detail-value">${record.branch || 'N/A'}</span>
        </div>
      </div>
    `;
  } else {
    verificationResult.innerHTML = `
      <div class="verification-icon invalid">✕</div>
      <h2 style="margin:0; font-size:1.8rem; color:var(--error-text);">Invalid Certificate</h2>
      <p style="color:var(--muted); margin-top:8px;">We could not find any authentic record matching this QR code.</p>
    `;
  }
}

async function initialize() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyId = urlParams.get('verify');

    // Handle Verification Mode
    if (verifyId) {
      if (form) form.classList.add('hidden');
      setStatus("Verifying certificate...", "loading");
      
      const certificates = await loadCertificates();
      const record = certificates.byUuid.get(verifyId);
      
      renderVerificationResult(record);
      return;
    }

    // Handle Download Mode
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const regdNumber = normalizeRegd(input.value);
        input.value = regdNumber;

        if (!regdNumber) {
          setStatus("Please enter your registration number.", "error");
          return;
        }

        try {
          const certificates = await loadCertificates();
          const record = certificates.byRegd.get(regdNumber);

          // We check for record.uuid because our new python script uses it
          if (!record || (!record.certificate && !record.uuid)) {
            setStatus("Certificate not found for this registration number.", "error");
            return;
          }

          await downloadCertificate(record, regdNumber);
        } catch (error) {
          setStatus("Unable to load certificate records right now. Please try again later.", "error");
          console.error(error);
        }
      });
      
      // Pre-load data for faster downloads
      loadCertificates().catch(() => {});
    }

  } catch (error) {
    console.error("Initialization failed:", error);
    setStatus("System error. Please try again later.", "error");
  }
}

initialize();
