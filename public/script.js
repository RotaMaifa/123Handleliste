

let groceries = [];
let currentSuggestions = [];
let selectedIndex = -1;
let tagCycleIndex = 0;



const tagCycleOptions = ["(uten sukker)", "(oppskåret)", "(skivet)", "(ikke skivet)",  "(rimeligste)", "(first price)","none"];
const textarea = document.getElementById("textarea");
const suggestionsBox = document.getElementById("suggestions");
const unitInput = document.getElementById("unitInput");
let previousUnit = getUnit();  // Initialize with current unit
let isNavigatingSuggestions = false;

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
    // Use shared normalize function here — no need to redefine
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
  const originalLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();

  const unit = getUnit();

  // Regex to check if line is already fixed: qty + unit + product (+ optional tags)
  const fixedRegex = new RegExp(`^(\\d+)\\s*${unit.replace(".", "\\.")}\\s+(.*)$`, "i");

  // Parse original line quantity and product (including trailing tag if any)
  const originalMatch = originalLine.match(/^(\d+)?\s*(.*)$/);
  let qty = originalMatch?.[1] ? parseInt(originalMatch[1]) : 1;
  if (qty < 1) qty = 1;

  let productPart = originalMatch?.[2] || "";

  // --- Extract trailing tag from productPart ---
  // This matches a trailing tag like (uten sukker), (skivet), etc. at end of line
  let trailingTag = "";
  for (const tag of tagCycleOptions.filter(t => t !== "none")) {
    const normTag = normalize(tag);
    const normProd = normalize(productPart);
    if (normProd.endsWith(normTag)) {
      const index = productPart.toLowerCase().lastIndexOf(tag.toLowerCase());
      if (index !== -1) {
        trailingTag = productPart.slice(index).trim();
        productPart = productPart.slice(0, index).trim();
        break;
      }
    }
  }


  // Build fixed line with updated qty, unit, product and trailing tag
  let fixedLine = `${qty} ${unit} ${capitalizeWords(word)}`;
  if (trailingTag) {
    fixedLine += ` ${trailingTag}`;
  }

  fixedLine = autoFixLine(fixedLine);

  // Parse fixed line to get product again for comparison
  const fixedMatch = fixedLine.match(fixedRegex);
  const fixedProduct = fixedMatch ? fixedMatch[2].toLowerCase().trim() : "";
  const suggestion = word.toLowerCase().trim();

  if (lineMatchesSuggestion(originalLine, word)) {
    // Original line already fixed → apply delta (change qty)
    let newQty = parseInt(fixedMatch[1]);
    newQty += delta;
    if (newQty < 1) newQty = 1;

    fixedLine = `${newQty} ${unit} ${capitalizeWords(word)}`;
    if (trailingTag) {
      fixedLine += ` ${trailingTag}`;
    }
  }

  // Replace the line in textarea
  const newText =
    text.substring(0, lineStart) +
    fixedLine +
    text.substring(lineEnd === -1 ? text.length : lineEnd);

  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = lineStart + fixedLine.length;
  textarea.focus();
}


function insertSelectedSuggestion(word) {
  const cursorPos = textarea.selectionStart;
  const text = textarea.value;

  const lineStart = text.lastIndexOf("\n", cursorPos - 1) + 1;
  const lineEnd = text.indexOf("\n", cursorPos);
  const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();

  // Replace just the product part of the line with the selected suggestion
  const match = currentLine.match(/^(\d+)?\s*(.*)$/);
  let fixedLine = `1 ${getUnit()} ${capitalizeWords(word)}`;

  if (match) {
    const amount = match[1] || "1";
    fixedLine = `${amount} ${getUnit()} ${capitalizeWords(word)}`;
  }

  // Pass through autoFixLine to apply known typos & product variants
  fixedLine = autoFixLine(fixedLine);

  // Replace in full text
  const newText = text.substring(0, lineStart) + fixedLine + text.substring(lineEnd === -1 ? text.length : lineEnd);
  
  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = lineStart + fixedLine.length;
  textarea.focus();
}


function normalize(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function triggerSuggestionFromCursor() {
  const cursorPos = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();

  const unit = getUnit().replace(".", "\\.");
  const regex = new RegExp(`^(\\d+)?\\s*${unit}?\\s*(.*)$`, "i");
  const match = currentLine.match(regex);

  let rawProductPart = match && match[2] ? match[2].trim() : "";

  // Build tag regex with raw tag values (not normalized yet)
  const rawTags = tagCycleOptions.filter(tag => tag !== "none");

  for (const rawTag of rawTags) {
    const normTag = normalize(rawTag);
    const normProduct = normalize(rawProductPart);

    if (normProduct.endsWith(normTag)) {
      // Find the tag position in rawProductPart case-insensitively
      const rawProductLower = rawProductPart.toLowerCase();
      const rawTagLower = rawTag.toLowerCase();

      const rawIndex = rawProductLower.lastIndexOf(rawTagLower);
      if (rawIndex !== -1) {
        rawProductPart = rawProductPart.slice(0, rawIndex).trim();
      }
      break;
    }
  }


  const normalizedProduct = normalize(rawProductPart);

  if (normalizedProduct.length > 0) {
    const matchedItems = groceries.filter(item => normalize(item) === normalizedProduct);

    if (matchedItems.length > 0) {
      currentSuggestions = matchedItems;
      showSuggestions(currentSuggestions);
    } else {
      showSuggestions(); // Show "Ingen forslag"
    }
  } else {
    showSuggestions();
  }
}



// Trigger suggestions even when clicking on a line
textarea.addEventListener("click", () => {
  setTimeout(triggerSuggestionFromCursor, 0);  // slight delay to get updated cursor pos
});



textarea.addEventListener("keyup", (e) => {
  if (["ArrowUp", "ArrowDown"].includes(e.key)) {
    isNavigatingSuggestions = false;
    return;  // Don’t interfere after navigating
  }

  updateSuggestions();    

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
  const unitEscaped = getUnit().trim().replace(".", "\\.");

  const normalizedLine = normalize(line);
  const normalizedSuggestion = normalize(suggestionText);

  const suggestionPattern = normalizedSuggestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

  const tags = tagCycleOptions
    .filter(tag => tag !== "none")
    .map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join("|");

  const tagPart = tags ? `(\\s+(${tags}))?` : "";

  const regex = new RegExp(
    `^(\\d+)\\s*${unitEscaped}\\s+${suggestionPattern}${tagPart}$`
  );

  return regex.test(normalizedLine);
}


// Key Handling
textarea.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown"].includes(e.key)) {
    isNavigatingSuggestions = true;
  }
  const lines = textarea.value.split("\n");
  const cursorPos = textarea.selectionStart;
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim().toLowerCase();
  const isArrowKey = e.key === "ArrowUp" || e.key === "ArrowDown";

  if (suggestionsBox.style.display === "block" && !e.ctrlKey) {
    const items = suggestionsBox.querySelectorAll("li");

    // Filter valid suggestions (exclude placeholders, "Ingen forslag", "index")
    const validSuggestions = Array.from(items).filter(item => {
      const txt = item.textContent.trim().toLowerCase();
      return txt !== "Ingen forslag" && txt !== "Begynn å skrive dagligvarelisten" && !item.classList.contains("placeholder");
    });

	// Dont allow Suggestion Navigation if there is only one Suggestion and that is the same as 
	// whats written in line. 
    const noSuggestions = validSuggestions.length === 0;
    let allowSuggestionNavigation;
    const oneSuggestionMatchesLine =
      validSuggestions.length === 1 &&
      lineMatchesSuggestion(currentLine, validSuggestions[0].textContent.trim());

    allowSuggestionNavigation = !noSuggestions && !oneSuggestionMatchesLine;


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

      if (selectedItem.classList.contains("placeholder") || selectedText === "Ingen forslag" || selectedText === "index") {
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
		  //updateSuggestions();
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

  const normalizedGroceries = groceries.map(g => normalize(g));

  // Match format: "1 lett melk"
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (match) {
    const quantity = match[1];
    const itemName = normalize(match[2]);
    if (normalizedGroceries.includes(itemName)) {
      line = `${quantity} ${getUnit()} ${capitalizeWords(match[2])}`;  // capitalize original casing
    }
  } else {
    // Match: "lett melk" (no quantity)
    if (normalizedGroceries.includes(normalize(line))) {
      line = `1 ${getUnit()} ${capitalizeWords(line)}`;
    }
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

  // Use normalize here for consistent matching
  const normalizedGroceries = groceries.map(g => normalize(g));

  const updatedLines = lines.map((line) => {
    // Fix known typos and variants first
    const fixedLine = fixKnownTyposAndProducts(line);

    // Normalize prefixes & add current prefix, passing normalizedGroceries for matching
    return normalizeLinePrefix(fixedLine, currentPrefix, normalizedGroceries);
  });

  textarea.value = capitalizeItemLines(updatedLines.join("\n"));
});



function normalizeLinePrefix(line, prefix, normalizedGroceries) {
  const normalize = (str) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const trimmed = line.trim();
  if (!trimmed) return "";

  // Match quantity and rest of line
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) return trimmed;

  const quantity = match[1];
  let itemText = match[2].trim();

  // Remove old prefixes (#, stk., pk., etc.) from start
  itemText = itemText.replace(/^(#|stk\.|pk\.|stk|pk)\s*/i, "").trim();

  // Normalize for matching
  const itemNameNormalized = normalize(itemText);

  // Check if item is in groceries list (already normalized)
  if (normalizedGroceries.includes(itemNameNormalized)) {
    return `${quantity} ${prefix} ${itemText}`;
  }

  // Try split with sub-prefix (like "stk. ketchup")
  const subMatch = itemText.match(/^([^\s]+)\s+(.*)$/);
  if (subMatch) {
    const maybePrefix = subMatch[1];
    const rest = subMatch[2].trim();

    const fullNormalized = normalize(`${maybePrefix} ${rest}`);
    const restNormalized = normalize(rest);

    if (normalizedGroceries.includes(fullNormalized)) {
      return `${quantity} ${prefix} ${rest}`;
    }

    if (normalizedGroceries.includes(restNormalized)) {
      return `${quantity} ${prefix} ${rest}`;
    }
  }

  // If no match, still add prefix
  return `${quantity} ${prefix} ${itemText}`;
}


// Shared utility: Fix known typos and product variants
function fixKnownTyposAndProducts(line) {
  if (!line) return "";

  const softDrinkKeywords = [
    "coca zero",
    "coca-cola",
    "cola zero",
    "cola",
    "dahls",
    "fanta (uten sukker)",
    "fanta lemon",
    "fanta",
    "farris lime",
    "farris",
    "frus bringebær",
    "frus",
    "hansa",
    "munkholm",
    "pepsi lime",
    "pepsi max mango",
    "pepsi max",
    "pepsi",
    "pærebrus (uten sukker)",
    "pærebrus",	
    "solo super rød – rabarbra",
    "solo super",
    "solo",
    "sprite zero",
    "tuborg",
    "urge (uten sukker)",
    "urge",
    "villa (uten sukker)",
    "villa"	
  ];

  const lineLower = line.toLowerCase();
  const containsSoftDrinkKeyword = softDrinkKeywords.some(keyword =>
    lineLower.includes(keyword.toLowerCase())
  );
  
  // Only replace if it's dinking item w/multiple sizes in the line
  if (containsSoftDrinkKeyword) {
    line = line.replace(/\bb\b/gi, "boks");
    line = line.replace(/\bl\b/gi, "liten");
    line = line.replace(/\bs\b/gi, "stor");	
  }



  // Only replace if it's a single-letter token at the end of the line
  const tags = {
    u: "(uten sukker)",
    o: "(oppskåret)",
    s: "(skivet)",
    i: "(ikke skivet)",
    r: "(rimeligste)",
    f: "(first price)"
  };

  for (const [abbr, full] of Object.entries(tags)) {
    // Matches: space or start → abbr → end of line
    const regex = new RegExp(`(?:^|\\s)${abbr}$`, "i");
    if (regex.test(line.trim())) {
      // Replace the exact token at end
      line = line.replace(regex, match => match.replace(new RegExp(`${abbr}$`, "i"), full));
      break; // Only one match allowed
    }
  }

  // Special fixes
  line = line.replace(/\bmalk\b/gi, "melk"); 
  line = line.replace(/\bu\/sukker\b/gi, "(uten sukker)");	
  line = line.replace(/(?<=\s)&(?=\s)/g, "og");
  line = line.replace(/\bm\//gi, "med ");
  line = line.trim();

  // Pack replacements
  const replacements_packs = [   
    { match: /^\d*\s*12 pk\.?\s*egg$/i, replaceWith: "12pk. egg" },
    { match: /^\d*\s*12pk\.?\s*egg$/i, replaceWith: "12pk. egg" },
    { match: /^\d*\s*18 pk\.?\s*egg$/i, replaceWith: "18pk. egg" },
    { match: /^\d*\s*18pk\.?\s*egg$/i, replaceWith: "18pk. egg" },
    { match: /^\d*\s*4 pk\.?\s*co(?:la|ca) zero$/i, replaceWith: "4pk. coca zero 0.33l" },
    { match: /^\d*\s*4 pk\.?\s*coca cola$/i, replaceWith: "4pk. coca-cola 1.5l" },
    { match: /^\d*\s*4 pk\.?\s*pepsi max$/i, replaceWith: "4pk. pepsi max 1.5l" },
    { match: /^\d*\s*4 pk\.?\s*pepsi$/i, replaceWith: "4pk. pepsi 1.5l" },
    { match: /^\d*\s*4pk\.?\s*co(?:la|ca) zero$/i, replaceWith: "4pk. coca zero 0.33l" },
    { match: /^\d*\s*4pk\.?\s*coca cola$/i, replaceWith: "4pk. coca-cola 1.5l" },	
    { match: /^\d*\s*4pk\.?\s*pepsi max$/i, replaceWith: "4pk. pepsi max 1.5l" },
    { match: /^\d*\s*4pk\.?\s*pepsi$/i, replaceWith: "4pk. pepsi 1.5l" },
    { match: /^\d*\s*6 pk\.?\s*egg$/i, replaceWith: "6pk. egg" },
    { match: /^\d*\s*6pk\.?\s*egg$/i, replaceWith: "6pk. egg" }

  ];

  for (const { match, replaceWith } of replacements_packs) {
    if (match.test(line)) {
      line = line.replace(match, replaceWith);
      return line.trim();
    }
  }

  // Single product replacements
  const replacements = [ 
	{ match: /^\d*\s*boks coca zero$/i, replaceWith: "coca zero 0.33l" },
	{ match: /^\d*\s*boks coca-cola$/i, replaceWith: "coca-cola 0.33l" },
	{ match: /^\d*\s*boks cola zero$/i, replaceWith: "cola zero 0.33l" },
	{ match: /^\d*\s*boks cola$/i, replaceWith: "cola 0.33l" },
	{ match: /^\d*\s*boks fanta lemon$/i, replaceWith: "fanta lemon 0.33l" },
	{ match: /^\d*\s*boks fanta uten sukker$/i, replaceWith: "fanta 0.33l (uten sukker)" },
	{ match: /^\d*\s*boks fanta$/i, replaceWith: "fanta 0.33l" },
	{ match: /^\d*\s*boks farris lime$/i, replaceWith: "farris lime 0.33l" },
	{ match: /^\d*\s*boks farris$/i, replaceWith: "farris 0.33l" },
	{ match: /^\d*\s*boks frus bringebær$/i, replaceWith: "frus bringebær 0.33l" },
	{ match: /^\d*\s*boks frus$/i, replaceWith: "frus 0.33l" },
	{ match: /^\d*\s*boks pepsi lime$/i, replaceWith: "pepsi lime 0.33l" },
	{ match: /^\d*\s*boks pepsi max mango$/i, replaceWith: "pepsi max mango 0.33l" },
	{ match: /^\d*\s*boks pepsi max$/i, replaceWith: "pepsi max 0.33l" },
	{ match: /^\d*\s*boks pepsi$/i, replaceWith: "pepsi 0.33l" },
	{ match: /^\d*\s*boks pærebrus uten sukker$/i, replaceWith: "pærebrus 0.33l (uten sukker)" },
	{ match: /^\d*\s*boks pærebrus$/i, replaceWith: "pærebrus 0.33l" },
	{ match: /^\d*\s*boks solo super rød rabarbra$/i, replaceWith: "solo super rød - rabarbra 0.33l" },
	{ match: /^\d*\s*boks solo super$/i, replaceWith: "solo super 0.33l" },
	{ match: /^\d*\s*boks solo$/i, replaceWith: "solo 0.33l" },
	{ match: /^\d*\s*boks sprite zero$/i, replaceWith: "sprite zero 0.33l" },
	{ match: /^\d*\s*boks urge uten sukker$/i, replaceWith: "urge 0.33l (uten sukker)" },
	{ match: /^\d*\s*boks urge$/i, replaceWith: "urge 0.33l" },
	{ match: /^\d*\s*boks villa uten sukker$/i, replaceWith: "villa 0.33l (uten sukker)" },
	{ match: /^\d*\s*boks villa$/i, replaceWith: "villa 0.33l" },
	{ match: /^\d*\s*liten coca zero$/i, replaceWith: "coca zero 0.5l" },
	{ match: /^\d*\s*liten coca-cola$/i, replaceWith: "coca-cola 0.5l" },
	{ match: /^\d*\s*liten cola zero$/i, replaceWith: "cola zero 0.5l" },
	{ match: /^\d*\s*liten cola$/i, replaceWith: "cola 0.5l" },
	{ match: /^\d*\s*liten dahls$/i, replaceWith: "dahls 0.33l" },
	{ match: /^\d*\s*liten fanta lemon$/i, replaceWith: "fanta lemon 0.5l" },
	{ match: /^\d*\s*liten fanta uten sukker$/i, replaceWith: "fanta 0.5l (uten sukker)" },
	{ match: /^\d*\s*liten fanta$/i, replaceWith: "fanta 0.5l" },
	{ match: /^\d*\s*liten farris lime$/i, replaceWith: "farris lime 0.5l" },
	{ match: /^\d*\s*liten farris$/i, replaceWith: "farris 0.5l" },
	{ match: /^\d*\s*liten frus bringebær$/i, replaceWith: "frus bringebær 0.5l" },
	{ match: /^\d*\s*liten frus$/i, replaceWith: "frus 0.5l" },
	{ match: /^\d*\s*liten hansa$/i, replaceWith: "hansa 0.33l" },
	{ match: /^\d*\s*liten munkholm$/i, replaceWith: "munkholm 0.33l" },
	{ match: /^\d*\s*liten pepsi lime$/i, replaceWith: "pepsi lime 0.5l" },
	{ match: /^\d*\s*liten pepsi max mango$/i, replaceWith: "pepsi max mango 0.5l" },
	{ match: /^\d*\s*liten pepsi max$/i, replaceWith: "pepsi max 0.5l" },
	{ match: /^\d*\s*liten pepsi$/i, replaceWith: "pepsi 0.5l" },
	{ match: /^\d*\s*liten pærebrus uten sukker$/i, replaceWith: "pærebrus 0.5l (uten sukker)" },
	{ match: /^\d*\s*liten pærebrus$/i, replaceWith: "pærebrus 0.5l" },
	{ match: /^\d*\s*liten solo super rød rabarbra$/i, replaceWith: "solo super rød - rabarbra 0.5l" },
	{ match: /^\d*\s*liten solo super$/i, replaceWith: "solo super 0.5l" },
	{ match: /^\d*\s*liten solo$/i, replaceWith: "solo 0.5l" },
	{ match: /^\d*\s*liten sprite zero$/i, replaceWith: "sprite zero 0.5l" },
	{ match: /^\d*\s*liten tuborg$/i, replaceWith: "tuborg 0.33l" },
	{ match: /^\d*\s*liten urge uten sukker$/i, replaceWith: "urge 0.5l (uten sukker)" },
	{ match: /^\d*\s*liten urge$/i, replaceWith: "urge 0.5l" },
	{ match: /^\d*\s*liten villa uten sukker$/i, replaceWith: "villa 0.5l (uten sukker)" },
	{ match: /^\d*\s*liten villa$/i, replaceWith: "villa 0.5l" },
	{ match: /^\d*\s*røyk$/i, replaceWith: "paramount 20pk sigaretter. (om dere ikke har paramount, ta da prince hvit/rød.)" },
	{ match: /^\d*\s*stor coca zero$/i, replaceWith: "coca zero 1.5l" },
	{ match: /^\d*\s*stor coca-cola$/i, replaceWith: "coca-cola 1.5l" },
	{ match: /^\d*\s*stor cola zero$/i, replaceWith: "cola zero 1.5l" },
	{ match: /^\d*\s*stor cola$/i, replaceWith: "cola 1.5l" },
	{ match: /^\d*\s*stor dahls$/i, replaceWith: "dahls 0.5l" },
	{ match: /^\d*\s*stor fanta lemon$/i, replaceWith: "fanta lemon 1.5l" },
	{ match: /^\d*\s*stor fanta uten sukker$/i, replaceWith: "fanta 1.5l (uten sukker)" },
	{ match: /^\d*\s*stor fanta$/i, replaceWith: "fanta 1.5l" },
	{ match: /^\d*\s*stor farris lime$/i, replaceWith: "farris lime 1.5l" },
	{ match: /^\d*\s*stor farris$/i, replaceWith: "farris 1.5l" },
	{ match: /^\d*\s*stor frus bringebær$/i, replaceWith: "frus bringebær 1.5l" },
	{ match: /^\d*\s*stor frus$/i, replaceWith: "frus 1.5l" },
	{ match: /^\d*\s*stor hansa$/i, replaceWith: "hansa 0.5l" },
	{ match: /^\d*\s*stor munkholm$/i, replaceWith: "munkholm 0.5l" },
	{ match: /^\d*\s*stor pepsi lime$/i, replaceWith: "pepsi lime 1.5l" },
	{ match: /^\d*\s*stor pepsi max mango$/i, replaceWith: "pepsi max mango 1.5l" },
	{ match: /^\d*\s*stor pepsi max$/i, replaceWith: "pepsi max 1.5l" },
	{ match: /^\d*\s*stor pepsi$/i, replaceWith: "pepsi 1.5l" },
	{ match: /^\d*\s*stor pærebrus uten sukker$/i, replaceWith: "pærebrus 1.5l (uten sukker)" },
	{ match: /^\d*\s*stor pærebrus$/i, replaceWith: "pærebrus 1.5l" },
	{ match: /^\d*\s*stor solo super rød rabarbra$/i, replaceWith: "solo super rød - rabarbra 1.5l" },
	{ match: /^\d*\s*stor solo super$/i, replaceWith: "solo super 1.5l" },
	{ match: /^\d*\s*stor solo$/i, replaceWith: "solo 1.5l" },
	{ match: /^\d*\s*stor sprite zero$/i, replaceWith: "sprite zero 1.5l" },
	{ match: /^\d*\s*stor tuborg$/i, replaceWith: "tuborg 0.5l" },
	{ match: /^\d*\s*stor urge uten sukker$/i, replaceWith: "urge 1.5l (uten sukker)" },
	{ match: /^\d*\s*stor urge$/i, replaceWith: "urge 1.5l" },
	{ match: /^\d*\s*stor villa uten sukker$/i, replaceWith: "villa 1.5l (uten sukker)" },
	{ match: /^\d*\s*stor villa$/i, replaceWith: "villa 1.5l" },
	{ match: /^\d*\s*tobakk$/i, replaceWith: "tobakk tiedemanns rød, gul hvis tomt for rød." },  
    { match: /^\d*\s*12 egg$/i, replaceWith: "12pk. egg" },
    { match: /^\d*\s*18 egg$/i, replaceWith: "18pk. egg" },
    { match: /^\d*\s*6 egg$/i, replaceWith: "6pk. egg" },
    { match: /^\d*\s*ananasringer$/i, replaceWith: "3pk. ananasringer" },
    { match: /^\d*\s*barberblader$/i, replaceWith: "mach 3 barberblader" },
    { match: /^\d*\s*big one$/i, replaceWith: "big one classic" },
    { match: /^\d*\s*coca cola$/i, replaceWith: "coca-cola 0.5l" },
    { match: /^\d*\s*cola zero$/i, replaceWith: "coca zero 0.33l" },
    { match: /^\d*\s*cola$/i, replaceWith: "cola 1.5l" },
    { match: /^\d*\s*fanta$/i, replaceWith: "fanta 1.5l" },
    { match: /^\d*\s*farris lime$/i, replaceWith: "farris lime 0.5l" },
    { match: /^\d*\s*farris$/i, replaceWith: "farris 0.5l" },
    { match: /^\d*\s*first price cola$/i, replaceWith: "cola 1.5l first price (uten sukker)" },
    { match: /^\d*\s*fiskeboller$/i, replaceWith: "fjordland fiskeboller" },
    { match: /^\d*\s*fiskekaker$/i, replaceWith: "fjordland fiskekaker" },
    { match: /^\d*\s*flesk og duppe$/i, replaceWith: "fersk & ferdig flesk og duppe" },
    { match: /^\d*\s*frus$/i, replaceWith: "frus bringebær 0.5l" },
    { match: /^\d*\s*grøt$/i, replaceWith: "fjordland risengrynsgrøt" },
    { match: /^\d*\s*hansa$/i, replaceWith: "hansa lettøl 0.5l" },
    { match: /^\d*\s*kjøttkake$/i, replaceWith: "fjordland kjøttkake" },
    { match: /^\d*\s*kokesjokolade$/i, replaceWith: "freia kokesjokolade 70%" },
    { match: /^\d*\s*laks$/i, replaceWith: "fjordland laks" },
    { match: /^\d*\s*lasagne$/i, replaceWith: "fersk & ferdig lasagne" },
    { match: /^\d*\s*lite pannekakemix$/i, replaceWith: "lite pk. toro pannekakemix" },
    { match: /^\d*\s*lite vaffelmix$/i, replaceWith: "lite pk. toro vaffelmix" },
    { match: /^\d*\s*løs snus$/i, replaceWith: "general løs snus" },
    { match: /^\d*\s*melk$/i, replaceWith: "lett melk" },
    { match: /^\d*\s*munkholm$/i, replaceWith: "munkholm alkoholfri 0.33l" },
    { match: /^\d*\s*olw$/i, replaceWith: "olw cheez doodles original" },
    { match: /^\d*\s*pepsi max$/i, replaceWith: "pepsi max 1.5l" },
    { match: /^\d*\s*pepsi$/i, replaceWith: "pepsi 1.5l" },
    { match: /^\d*\s*porsjon snus$/i, replaceWith: "general porsjon snus" },
    { match: /^\d*\s*pærebrus$/i, replaceWith: "pærebrus 1.5l (uten sukker)" },
    { match: /^\d*\s*raspeballer$/i, replaceWith: "fjordland raspeballer" },
    { match: /^\d*\s*risengrynsgrøt$/i, replaceWith: "fjordland risengrynsgrøt" },
    { match: /^\d*\s*rømmegrøt$/i, replaceWith: "fjordland rømmegrøt" },
    { match: /^\d*\s*sigaretter$/i, replaceWith: "paramount 20pk sigaretter. (om dere ikke har paramount, ta da prince hvit/rød.)" },
    { match: /^\d*\s*solo super$/i, replaceWith: "solo super 0.5l" },
    { match: /^\d*\s*sprite$/i, replaceWith: "sprite 1.5l" },
    { match: /^\d*\s*stor pannekakemix$/i, replaceWith: "stor pk. toro pannekakemix" },
    { match: /^\d*\s*stor vaffelmix$/i, replaceWith: "stor pk. toro vaffelmix" },
    { match: /^\d*\s*strømpebukse$/i, replaceWith: "strømpebukse Lamote Motelongs Tan 36/44" },
    { match: /^\d*\s*svenske kjøttboller$/i, replaceWith: "fjordland svenske kjøttboller" },
    { match: /^\d*\s*sweet and sour$/i, replaceWith: "fjordland sweet and sour kylling" },
    { match: /^\d*\s*torsk$/i, replaceWith: "fjordland torsk" },
    { match: /^\d*\s*truser$/i, replaceWith: "truser pierre robert high waist (organic cotton). sort. str. large" },
    { match: /^\d*\s*urge$/i, replaceWith: "urge 1.5l" },
    { match: /^\d*\s*villa$/i, replaceWith: "villa 1.5l (uten sukker)" }
  ];

  const numberAndItemMatch = line.match(/^(\d*)\s*(.*)$/);
  if (numberAndItemMatch) {
    const numberPart = numberAndItemMatch[1];
    const itemPart = numberAndItemMatch[2].trim();


    // 🔁 Try to apply a replacement rule
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



document.addEventListener("DOMContentLoaded", () => {
  const slider = document.getElementById("fontSizeSlider");
  const textarea = document.getElementById("textarea");
  const fontSizeValue = document.getElementById("fontSizeValue");

  // Set color here just in case
  fontSizeValue.style.color = "#e0f7fa";

  function updateFontSize(sizePx) {
    textarea.style.fontSize = sizePx;
    fontSizeValue.textContent = parseInt(sizePx, 10);  // show only number

    const suggestionItems = document.querySelectorAll("#suggestions li");
    suggestionItems.forEach(item => {
      item.style.fontSize = sizePx;
    });
  }

  slider.addEventListener("input", () => {
    const size = slider.value + "px";
    updateFontSize(size);
  });

  // Initialize on load
  updateFontSize(slider.value + "px");
});
