
let groceries = [];
let currentSuggestions = [];
let selectedIndex = -1;
let tagCycleIndex = 0;

const tagCycleOptions = ["(skivet)", "(ikke skivet)", "(oppskåret)", "(uten sukker)", "(rimeligste)", "(first price)","none"];
const textarea = document.getElementById("textarea");
const suggestionsBox = document.getElementById("suggestions");
const unitInput = document.getElementById("unitInput");
let previousUnit = getUnit();  // Initialize with current unit

function getUnit() {
  return unitInput.value.trim() || "stk.";
}

// Load groceries from multiple JSON files
const groceryFiles = [
  "mat.json",
  "drikke.json", 
  "meieri.json",
  "personlig.json",
  "renhold.json",
  "varer.json"
];

Promise.all(
  groceryFiles.map(file =>
    fetch(file)
      .then(res => res.json())
      .catch(err => {
        console.error(`Feil ved lasting av ${file}:`, err);
        return []; // fallback to empty array if one file fails
      })
  )
).then(results => {
  // Merge and lowercase all items
  groceries = results.flat().map(item => item.toLowerCase());
});



function insertAtCursor(text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const currentText = textarea.value;
  textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

// Handle one section at a time
function getCurrentSectionItems(cursorPos) {
  const lines = textarea.value.split("\n");
  let sectionStart = 0;
  let sectionEnd = lines.length;
  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isHeader = line === "__________________________________" && lines[i + 1] && lines[i + 1] === lines[i + 1].toUpperCase();

    const start = charCount;
    const end = charCount + lines[i].length;

    if (isHeader && end < cursorPos) {
      sectionStart = i + 2;
    } else if (isHeader && start > cursorPos) {
      sectionEnd = i;
      break;
    }

    charCount += lines[i].length + 1;
  }

  // Extract item names only (e.g., from "3 stk. lett melk" → "lett melk")
  const itemRegex = new RegExp(`^\\d+\\s*${getUnit().replace(".", "\\.")}\\s+(.+)$`, "i");

  return lines
    .slice(sectionStart, sectionEnd)
    .map(line => {
      const match = line.trim().match(itemRegex);
      return match ? match[1].toLowerCase() : null;
    })
    .filter(Boolean); // Remove nulls
}

// Typing Suggestions
textarea.addEventListener("input", updateSuggestions);
function updateSuggestions() {
  const cursorPos = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();

  if (currentLine === "") {
    currentSuggestions = [];
    showSuggestions(currentSuggestions);
    return;
  }

  const unit = getUnit().replace(".", "\\.");
  const match = currentLine.match(new RegExp(`(?:\\d+\\s*(${unit})?\\s*)?([\\p{L}]{2,})$`, "u"));
  const query = match ? match[2] : "";

  if (query.length > 0) {
    const sectionItems = getCurrentSectionItems(cursorPos);
    const normalize = (str) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedQuery = normalize(query);

    currentSuggestions = groceries
      .filter(item => !sectionItems.includes(item))
      .filter(item => normalize(item).includes(normalizedQuery))
      .sort((a, b) => {
        const normalizeA = normalize(a);
        const normalizeB = normalize(b);

        const aStarts = normalizeA.startsWith(normalizedQuery);
        const bStarts = normalizeB.startsWith(normalizedQuery);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordMatch = normalizeA.split(" ").some(word => word.startsWith(normalizedQuery));
        const bWordMatch = normalizeB.split(" ").some(word => word.startsWith(normalizedQuery));

        if (aWordMatch && !bWordMatch) return -1;
        if (!aWordMatch && bWordMatch) return 1;

        return a.localeCompare(b);
      });
  } else {
    currentSuggestions = [];
  }

  showSuggestions(currentSuggestions);
}



function showSuggestions(list) {
  suggestionsBox.innerHTML = "";

  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Ingen forslag"; // or "No suggestions"
    li.classList.add("placeholder");  // Add a class to identify
    li.style.color = "#666";
    li.style.padding = "6px";
    li.style.fontStyle = "italic";
    li.style.pointerEvents = "none";  // Prevent click
    suggestionsBox.appendChild(li);
  } else {
    list.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;

      // Left-click to insert/increment
      li.addEventListener("click", () => applySuggestion(item, +1));

      // Right-click to decrement
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        applySuggestion(item, -1);
      });

      suggestionsBox.appendChild(li);
    });
  }

  suggestionsBox.style.display = "block";
  selectedIndex = -1;
}


function applySuggestion(word, delta = +1) {
  const cursorPos = textarea.selectionStart;
  const text = textarea.value;

  const lineStart = text.lastIndexOf("\n", cursorPos - 1) + 1;
  const lineEnd = text.indexOf("\n", cursorPos);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
  const regex = new RegExp(`^(\\d+)\\s*${getUnit().replace(".", "\\.")}\\s+(.*)$`, "i");
  const match = line.match(regex);

  let updatedLine = "";

  if (match && match[2].toLowerCase() === word.toLowerCase()) {
    // Matching item, update quantity
    let qty = parseInt(match[1]);
    qty += delta;
    if (qty < 1) qty = 1;  // You can remove the line if qty < 1 if preferred
    updatedLine = `${qty} ${getUnit()} ${capitalizeWords(word)}`;
  } else {
    // Not matching, insert new
    updatedLine = `1 ${getUnit()} ${capitalizeWords(word)}`;
  }

  // Rebuild text
  const newText = text.substring(0, lineStart) + updatedLine + text.substring(lineEnd === -1 ? text.length : lineEnd);

  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = lineStart + updatedLine.length;
  textarea.focus();

  // Don't hide suggestions anymore!
  // suggestionsBox.style.display = "none";
}


function insertSelectedSuggestion(word) {
  const cursorPos = textarea.selectionStart;
  const text = textarea.value;

  const lineStart = text.lastIndexOf("\n", cursorPos - 1) + 1;
  const lineEnd = text.indexOf("\n", cursorPos);
  const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();

  // Replace line with selected item, but just add as 1 unit if no match
  const regex = new RegExp(`^\\d+\\s*${getUnit().replace(".", "\\.")}\\s+${word}$`, "i");

  let updatedLine = currentLine.match(regex)
    ? currentLine
    : `1 ${getUnit()} ${capitalizeWords(word)}`;


  const newText = text.substring(0, lineStart) + updatedLine + text.substring(lineEnd === -1 ? text.length : lineEnd);

  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = lineStart + updatedLine.length;
  textarea.focus();

  // Keep suggestions open or hide if you want
  // suggestionsBox.style.display = "none";
}

function triggerSuggestionFromCursor() {
  const cursorPos = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();

  // Try to extract the item name from a formatted line like "4 stk. lett melk"
  const regex = new RegExp(`^(\\d+)?\\s*${getUnit().replace(".", "\\.")}?\\s*(.*)$`, "i");
  const match = currentLine.match(regex);
  const query = match && match[2] ? match[2].toLowerCase().trim() : "";

  if (query.length > 1) {
    currentSuggestions = groceries.filter(item => item.toLowerCase().trim() === query);
    showSuggestions(currentSuggestions);
  } else {
    suggestionsBox.style.display = "index";
  }
}

// Trigger suggestions even when clicking on a line
textarea.addEventListener("click", () => {
  setTimeout(triggerSuggestionFromCursor, 0);  // slight delay to get updated cursor pos
});

textarea.addEventListener("keyup", (e) => {
  // Ignore arrow keys and such
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  triggerSuggestionFromCursor();
});

// Capital first letter in groceries
function capitalizeItemLines(text) {
  return text.split("\n").map(line => {
    if (
      line.trim().match(/^_+$/) ||
      line.trim() === line.trim().toUpperCase()
    ) {
      return line; // Don't modify underline/header lines
    }

    const match = line.match(/^(\d+\s+stk\.?\s+)(.+)$/i);
    if (match) {
      const quantity = match[1];
      const item = match[2]
        .split(" ")
        .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" ");
      return quantity + item;
    }

    return line;
  }).join("\n");
}



// Change to headline
textarea.addEventListener("dblclick", () => {
  const cursor = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const currentUnit = getUnit();

  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineStart = charCount;
    const lineEnd = charCount + lines[i].length;

    if (cursor >= lineStart && cursor <= lineEnd) {
      const currentLine = lines[i].trim();

      // Prevent toggling if the line is empty
	  if (currentLine === "" || currentLine.includes(currentUnit)) {
	    break;  // just exit, do nothing on empty lines or lines containing currentUnit
	  }

      const isUnderline = currentLine.match(/^_+$/);
      const isUpperHeader = currentLine === currentLine.toUpperCase() && currentLine !== currentLine.toLowerCase();

      // Case 1: Revert header ? normal line
      if (isUpperHeader && i > 0 && lines[i - 1].trim().match(/^_+$/)) {
        const original = currentLine.toLowerCase();
        lines.splice(i - 1, 2, original); // remove underline and header, replace with original
        textarea.value = lines.join("\n");

        const newCursor = lines.slice(0, i).join("\n").length + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursor;
        break;
      }

      // Case 2: Apply header formatting
      if (!isUnderline) {
        lines.splice(i, 1, "__________________________________", currentLine.toUpperCase());
        textarea.value = lines.join("\n");

        const newCursor = lines.slice(0, i + 2).join("\n").length + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursor;
        break;
      }

      // Case 3: Clicked the underline ? do nothing
      break;
    }

    charCount += lines[i].length + 1;
  }
});


unitInput.addEventListener("change", () => {
  const currentUnit = getUnit();
  const oldUnitEscaped = previousUnit.replace(".", "\\.");
  const lines = textarea.value.split("\n");

  const updatedLines = lines.map(line => {
    const match = line.match(new RegExp(`^(\\d+)\\s*${oldUnitEscaped}\\s+(.*)$`, "i"));
    return match ? `${match[1]} ${currentUnit} ${match[2]}` : line;
  });

  textarea.value = updatedLines.join("\n");
  previousUnit = currentUnit;
});

// Helper to check if line is the exact same as suggestion + prefix +(tagRegex?)
function lineMatchesSuggestion(line, suggestionText) {
  // Escape the unit and suggestionText for regex
  const unitEscaped = getUnit().replace(".", "\\.");
  const suggestionEscaped = suggestionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build regex for tags (all except "none"), escaped and joined with |
  const tags = tagCycleOptions
    .filter(tag => tag !== "none")
    .map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join("|");

  // The tag part is optional (zero or one) with possible whitespace before it
  const tagPart = tags ? `(\\s+(${tags}))?` : "";

  const regex = new RegExp(
    `^(\\d+)\\s*${unitEscaped}\\s+${suggestionEscaped}${tagPart}$`,
    "i"
  );

  return regex.test(line.trim());
}

function checkLine(cursor, lines) {
  // Get line index based on cursor position
  const lineIndex = textarea.value.substring(0, cursor).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();
  const normalizedLine = currentLine.normalize("NFC");

  // Check if line is empty, only underscores, or all uppercase
  const isEmptyLine = currentLine === "";
  const isUnderline = currentLine === "__________________________________";
  const isAllCaps = /^[A-Z���0-9 .\-()]+$/.test(normalizedLine) &&
                    normalizedLine === normalizedLine.toUpperCase();

  return isEmptyLine || isUnderline || isAllCaps;
}

	
// Key Handling
function checkLine(cursor, lines) {
  // Get line index based on cursor position
  const lineIndex = textarea.value.substring(0, cursor).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();
  const normalizedLine = currentLine.normalize("NFC");

  // Check if line is empty, only underscores, or all uppercase
  const isEmptyLine = currentLine === "";
  const isUnderline = currentLine === "__________________________________";
  const isAllCaps = /^[A-Z���0-9 .\-()]+$/.test(normalizedLine) &&
                    normalizedLine === normalizedLine.toUpperCase();

  return isEmptyLine || isUnderline || isAllCaps;
}

// Key Handling
textarea.addEventListener("keydown", (e) => {
  const lines = textarea.value.split("\n");
  const cursorPos = textarea.selectionStart;
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim().toLowerCase();
  const isArrowKey = e.key === "ArrowUp" || e.key === "ArrowDown";

  if (suggestionsBox.style.display === "block" && !e.ctrlKey) {
    const items = suggestionsBox.querySelectorAll("li");

    // Filter valid suggestions (exclude placeholders, "ingen forslag", "index")
    const validSuggestions = Array.from(items).filter(item => {
      const txt = item.textContent.trim().toLowerCase();
      return txt !== "ingen forslag" && txt !== "index" && !item.classList.contains("placeholder");
    });

    const noSuggestions = validSuggestions.length === 0;

    let allowSuggestionNavigation;

    if (checkLine(cursorPos, lines)) {
      allowSuggestionNavigation = false;
    } else {
      const oneSuggestionMatchesLine =
        validSuggestions.length === 1 &&
        lineMatchesSuggestion(currentLine, validSuggestions[0].textContent.trim().toLowerCase());

      allowSuggestionNavigation = !noSuggestions && !oneSuggestionMatchesLine;
	  
      // Run updateSuggestions when navigating with arrows outside of suggestion navigation
      if (isArrowKey && (!allowSuggestionNavigation || suggestionsBox.style.display !== "block")) {
        updateSuggestions();
      }
    }



    if (allowSuggestionNavigation) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % validSuggestions.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + validSuggestions.length) % validSuggestions.length;
      }
    }

    if (e.key === "Enter" && selectedIndex >= 0 && validSuggestions.length > 0) {
      const selectedItem = validSuggestions[selectedIndex];
      const selectedText = selectedItem.textContent.trim().toLowerCase();

      if (selectedItem.classList.contains("placeholder") || selectedText === "ingen forslag" || selectedText === "index") {
        return;
      }

      const match = currentLine.match(new RegExp(`^(\\d+)?\\s*${getUnit().replace(".", "\\.")}?\\s*(.*)$`, "i"));
      const currentItem = match && match[2] ? match[2].toLowerCase().trim() : "";

      if (currentItem === selectedText) return; // don't insert duplicate

      e.preventDefault();
      insertSelectedSuggestion(selectedItem.textContent);
    }

    // Update active class only on validSuggestions and selectedIndex
    items.forEach(item => item.classList.remove("active"));
    if (selectedIndex >= 0 && allowSuggestionNavigation) {
      validSuggestions[selectedIndex].classList.add("active");
    }
  }

  // Auto-fix line on Enter
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const currentPos = textarea.selectionStart;
    const lines = textarea.value.split("\n");

    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineStart = charCount;
      const lineEnd = charCount + lines[i].length;

      if (currentPos >= lineStart && currentPos <= lineEnd + 1) {
        const originalLine = lines[i];
        const fixedLine = autoFixLine(originalLine.trim());

        if (originalLine !== fixedLine) {
          e.preventDefault(); // Stop default Enter

          lines[i] = fixedLine;
          textarea.value = lines.join("\n");

          // Move cursor to next line (without extra line)
          const newCursor = lines.slice(0, i + 1).join("\n").length + 1;
          textarea.selectionStart = textarea.selectionEnd = newCursor;
        }

        break;
      }

      charCount += lines[i].length + 1;
    }
  }

  // Ctrl + Up/Down: Adjust quantity
  if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (cursorPos >= charCount && cursorPos <= charCount + line.length) {
        let match = line.match(new RegExp(`^(\\d+)\\s*${getUnit().replace(".", "\\.")}\\s+(.*)`));
        if (match) {
          let qty = parseInt(match[1]);
          qty += e.key === "ArrowUp" ? 1 : -1;
          if (qty < 1) qty = 1;
          lines[i] = `${qty} ${getUnit()} ${match[2]}`;
          textarea.value = lines.join("\n");
          textarea.selectionStart = textarea.selectionEnd = cursorPos;
          break;
        }
      }
      charCount += line.length + 1;
    }
  }

  // Ctrl + Space: Cycle tags
  if (e.ctrlKey && e.code === "Space") {
    e.preventDefault();

    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = charCount;
      const lineEnd = charCount + lines[i].length;

      if (cursorPos >= lineStart && cursorPos <= lineEnd + 1) {
        let line = lines[i];

        // Build regex to match any tag in the options list (except "none")
        const tags = tagCycleOptions
          .filter(tag => tag !== "none")
          .map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // escape regex chars
          .join("|");

        const tagRegex = new RegExp(`\\s*(${tags})$`, "i");

        // Remove existing tag at end of line
        line = line.replace(tagRegex, "").trim();

        // Pick next tag
        tagCycleIndex = (tagCycleIndex + 1) % tagCycleOptions.length;
        const nextTag = tagCycleOptions[tagCycleIndex];

        if (nextTag !== "none") {
          line += ` ${nextTag}`;
        }

        lines[i] = line;
        textarea.value = lines.join("\n");

        // Restore cursor
        textarea.selectionStart = textarea.selectionEnd = lineStart + line.length;
        break;
      }

      charCount += lines[i].length + 1;
    }
  }
});


// Utility: Capitalize first letter of each word
function capitalizeWords(text) {
  return text
    .split(" ")
    .map(word =>
      word.charAt(0).toLocaleUpperCase("no-NO") + word.slice(1).toLocaleLowerCase("no-NO")
    )
    .join(" ");
}

// Utility: Auto-correct line
function autoFixLine(line) {
  if (!line) return "";

  // Detect if line ends with a tag
  const tags = tagCycleOptions
    .filter(tag => tag !== "none")
    .map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join("|");
  const tagRegex = new RegExp(`\\s*(${tags})$`, "i");

  const tagMatch = line.match(tagRegex);
  let tag = "";
  if (tagMatch) {
    tag = tagMatch[0].trim(); // tag including leading space
    line = line.replace(tagRegex, "").trim(); // remove tag for fixing
  }

  line = fixKnownTyposAndProducts(line);

  const normalizedGroceries = groceries.map(g => g.toLowerCase());

  // Match format: "1 lett melk"
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (match) {
    const quantity = match[1];
    const itemName = match[2].toLowerCase().trim();
    if (normalizedGroceries.includes(itemName)) {
      line = `${quantity} ${getUnit()} ${capitalizeWords(itemName)}`;
    }
  }

  // Match: "lett melk" (no quantity)
  if (normalizedGroceries.includes(line.toLowerCase())) {
    line = `1 ${getUnit()} ${capitalizeWords(line.toLowerCase())}`;
  }

  // Append tag back
  if (tag) {
    line += ` ${tag}`;
  }

  return line;
}


const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");

helpBtn.addEventListener("click", () => {
  helpModal.classList.remove("hidden");
});

closeHelp.addEventListener("click", () => {
  helpModal.classList.add("hidden");
});


// KOPIER
document.getElementById("copyBtn").addEventListener("click", () => {
  const textarea = document.getElementById("textarea");
  const messageBox = document.getElementById("copyMessage");

  navigator.clipboard.writeText(textarea.value)
    .then(() => {
      messageBox.classList.remove("hidden");
      setTimeout(() => {
        messageBox.classList.add("hidden");
      }, 2500); // message disappears after 2.5 seconds
    })
    .catch(err => {
      console.error("Kopiering feilet:", err);
      messageBox.textContent = "Kopiering mislyktes. Prøv igjen.";
      messageBox.classList.remove("hidden");
      messageBox.style.color = "#721c24";           // dark red text
      messageBox.style.border = "1px solid #f5c6cb";
      setTimeout(() => {
        messageBox.classList.add("hidden");
      }, 3500);
    });
});


// OPPDATER
document.getElementById("updateBtn").addEventListener("click", (e) => {
  e.preventDefault();

  const textarea = document.getElementById("textarea");
  const lines = textarea.value.split("\n");
  const currentPrefix = getUnit(); // e.g. "stk."

  const normalizedGroceries = groceries.map(g => g.toLowerCase());

  const updatedLines = lines.map((line) => {
    // Fix known typos and variants first
    const fixedLine = fixKnownTyposAndProducts(line);

    // Normalize prefixes & add current prefix
    return normalizeLinePrefix(fixedLine, currentPrefix, normalizedGroceries);
  });

  textarea.value = capitalizeItemLines(updatedLines.join("\n"));
});


function normalizeLinePrefix(line, prefix, normalizedGroceries) {
  const trimmed = line.trim();
  if (!trimmed) return "";

  // Match quantity and rest of line
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) return trimmed;

  const quantity = match[1];
  let itemText = match[2].trim();

  // Remove old prefixes (#, stk., pk., etc.) from start
  itemText = itemText.replace(/^(#|stk\.|pk\.|stk|pk)\s*/i, "").trim();

  // Lowercase for matching
  const itemNameLower = itemText.toLowerCase();

  // Check if item is in groceries list
  if (normalizedGroceries.includes(itemNameLower)) {
    return `${quantity} ${prefix} ${itemText}`;
  }

  // Try split with sub-prefix (like "stk. ketchup")
  const subMatch = itemText.match(/^([^\s]+)\s+(.*)$/);
  if (subMatch) {
    const maybePrefix = subMatch[1].toLowerCase();
    const rest = subMatch[2].trim();

    const fullLower = `${maybePrefix} ${rest}`.toLowerCase();

    if (normalizedGroceries.includes(fullLower)) {
      return `${quantity} ${prefix} ${rest}`;
    }

    if (normalizedGroceries.includes(rest.toLowerCase())) {
      return `${quantity} ${prefix} ${rest}`;
    }
  }

  // If no match, still add prefix
  return `${quantity} ${prefix} ${itemText}`;
}

// Shared utility: Fix known typos and product variants
function fixKnownTyposAndProducts(line) {
  if (!line) return "";

  line = line.replace(/\bmalk\b/gi, "melk");
  line = line.trim();

  // Pack replacements
  const replacements_packs = [   
    { match: /^\d*\s*6\.?\s*egg$/i, replaceWith: "6pk. egg" },
    { match: /^\d*\s*12\.?\s*egg$/i, replaceWith: "12pk. egg" },
    { match: /^\d*\s*18\.?\s*egg$/i, replaceWith: "18pk. egg" },
    { match: /^\d*\s*6pk\.?\s*egg$/i, replaceWith: "6pk. egg" },
    { match: /^\d*\s*12pk\.?\s*egg$/i, replaceWith: "12pk. egg" },
    { match: /^\d*\s*18pk\.?\s*egg$/i, replaceWith: "18pk. egg" },
    { match: /^\d*\s*4pk\.?\s*pepsi max$/i, replaceWith: "4pk. pepsi max 1.5l" },
    { match: /^\d*\s*4pk\.?\s*co(?:la|ca) zero$/i, replaceWith: "4pk. coca zero 0.33l" },
    { match: /^\d*\s*4pk\.?\s*pepsi$/i, replaceWith: "4pk. pepsi 1.5l" },
    { match: /^\d*\s*4pk\.?\s*coca cola$/i, replaceWith: "4pk. coca-cola 1.5l" },
  ];

  for (const { match, replaceWith } of replacements_packs) {
    if (match.test(line)) {
      line = line.replace(match, replaceWith);
      return line.trim();
    }
  }

  // Single product replacements
  const replacements = [  
    { match: /^\d*\s*melk$/i, replaceWith: "lett melk" },
    { match: /^\d*\s*solo super$/i, replaceWith: "solo super 0.5l" },
    { match: /^\d*\s*pepsi max$/i, replaceWith: "pepsi max 1.5l" },
    { match: /^\d*\s*pepsi$/i, replaceWith: "pepsi 1.5l" },
    { match: /^\d*\s*sprite$/i, replaceWith: "sprite 1.5l" },
    { match: /^\d*\s*urge$/i, replaceWith: "urge 1.5l" },
    { match: /^\d*\s*fanta$/i, replaceWith: "fanta 1.5l" },
    { match: /^\d*\s*cola$/i, replaceWith: "cola 1.5l" },
    { match: /^\d*\s*first price cola$/i, replaceWith: "cola 1.5l first price u/sukker" },
    { match: /^\d*\s*munkholm$/i, replaceWith: "munkholm alkoholfri 0.33l" },
    { match: /^\d*\s*coca cola$/i, replaceWith: "coca-cola 0.5l" },
    { match: /^\d*\s*sigaretter$/i, replaceWith: "paramount 20pk sigaretter. (om dere ikke har paramount, ta da prince hvit/rød.)" },
    { match: /^\d*\s*olw$/i, replaceWith: "olw cheez doodles original" },
    { match: /^\d*\s*kokesjokolade$/i, replaceWith: "freia kokesjokolade 70%" },
    { match: /^\d*\s*strømpebukse$/i, replaceWith: "strømpebukse Lamote Motelongs Tan 36/44" },
    { match: /^\d*\s*truser$/i, replaceWith: "truser pierre robert high waist (organic cotton). sort. str. large" },
    { match: /^\d*\s*farris$/i, replaceWith: "farris 0.5l" },
    { match: /^\d*\s*farris lime$/i, replaceWith: "farris lime 0.5l" },
    { match: /^\d*\s*frus$/i, replaceWith: "frus bringebær 0.5l" },
    { match: /^\d*\s*villa$/i, replaceWith: "villa u/sukker 1.5l" },
    { match: /^\d*\s*pærebrus$/i, replaceWith: "pærebrus u/sukker 1.5l" },
    { match: /^\d*\s*rømmegrøt$/i, replaceWith: "fjordland rømmegrøt" },
    { match: /^\d*\s*grøt$/i, replaceWith: "fjordland risengrynsgrøt" },
    { match: /^\d*\s*risengrynsgrøt$/i, replaceWith: "fjordland risengrynsgrøt" },
    { match: /^\d*\s*svenske kjøttboller$/i, replaceWith: "fjordland svenske kjøttboller" },
    { match: /^\d*\s*kjøttkake$/i, replaceWith: "fjordland kjøttkake" },
    { match: /^\d*\s*fiskeboller$/i, replaceWith: "fjordland fiskeboller" },
    { match: /^\d*\s*fiskekaker$/i, replaceWith: "fjordland fiskekaker" },
    { match: /^\d*\s*torsk$/i, replaceWith: "fjordland torsk" },
    { match: /^\d*\s*raspeballer$/i, replaceWith: "fjordland raspeballer" },
    { match: /^\d*\s*sweet and sour$/i, replaceWith: "fjordland sweet and sour kylling" },
    { match: /^\d*\s*lite vaffelmix$/i, replaceWith: "lite pk. toro vaffelmix" },
    { match: /^\d*\s*stor vaffelmix$/i, replaceWith: "stor pk. toro vaffelmix" },
    { match: /^\d*\s*big one$/i, replaceWith: "big one classic" },
    { match: /^\d*\s*lasagne$/i, replaceWith: "fersk & ferdig lasagne" },
    { match: /^\d*\s*laks$/i, replaceWith: "fjordland laks" },
    { match: /^\d*\s*ananasringer$/i, replaceWith: "3pk. ananasringer" },
    { match: /^\d*\s*porsjon snus$/i, replaceWith: "general porsjon snus" },
    { match: /^\d*\s*løs snus$/i, replaceWith: "general løs snus" },
    { match: /^\d*\s*lite pannekakemix$/i, replaceWith: "lite pk. toro pannekakemix" },
    { match: /^\d*\s*stor pannekakemix$/i, replaceWith: "stor pk. toro pannekakemix" },
    { match: /^\d*\s*hansa$/i, replaceWith: "hansa lettøl 0.5l" },
    { match: /^\d*\s*barberblader$/i, replaceWith: "mach 3 barberblader" },
    { match: /^\d*\s*flesk og duppe$/i, replaceWith: "fersk & ferdig flesk og duppe" },
    { match: /^\d*\s*cola zero$/i, replaceWith: "coca zero 0.33l" },
  ];

  const numberAndItemMatch = line.match(/^(\d*)\s*(.*)$/);
  if (numberAndItemMatch) {
    const numberPart = numberAndItemMatch[1];
    const itemPart = numberAndItemMatch[2];

    for (const { match, replaceWith } of replacements) {
      if (match.test(itemPart)) {
        const newItem = itemPart.replace(match, replaceWith);
        line = (numberPart ? numberPart + " " : "") + newItem;
        return line.trim();
      }
    }
  }

  return line.trim();
}
