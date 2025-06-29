let groceries = [];
let currentSuggestions = [];
let selectedIndex = -1;
let tagCycleIndex = 0;

const tagCycleOptions = ["(skivet)", "(ikke skivet)", "(oppskåret)", "(uten sukker)", "(rimeligste)", "(first price)","none"];
const textarea = document.getElementById("textarea");
const suggestionsBox = document.getElementById("suggestions");
const unitInput = document.getElementById("unitInput");

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
textarea.addEventListener("input", () => {
  const cursorPos = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();

  // Extract last word after optional quantity and "stk."
  const match = currentLine.match(/(?:\d+\s*(?:stk\.?)?\s*)?([\p{L}]{2,})$/u);
  const query = match ? match[1] : "";

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
});





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
    currentSuggestions = groceries.filter(item => item.includes(query));
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

  let charCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineStart = charCount;
    const lineEnd = charCount + lines[i].length;

    if (cursor >= lineStart && cursor <= lineEnd) {
      const currentLine = lines[i].trim();
      const isUnderline = currentLine.match(/^_+$/);
      const isUpperHeader = currentLine === currentLine.toUpperCase() && currentLine !== currentLine.toLowerCase();

      // Case 1: Revert header → normal line
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

      // Case 3: Clicked the underline → do nothing
      break;
    }

    charCount += lines[i].length + 1;
  }
});


// Key Handling
textarea.addEventListener("keydown", (e) => {
  const lines = textarea.value.split("\n");
  const cursor = textarea.selectionStart;

  // Suggestion navigation
  if (suggestionsBox.style.display === "block" && !e.ctrlKey) {
    const items = suggestionsBox.querySelectorAll("li");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
	} else if (e.key === "Enter" && selectedIndex >= 0) {
	  const selectedItem = items[selectedIndex];
	  if (selectedItem.classList.contains("placeholder")) {
		return; // Don't insert placeholders like "index"
	  }

	  const selectedText = selectedItem.textContent.trim().toLowerCase();
	  const cursorPos = textarea.selectionStart;
	  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
	  const currentLine = lines[lineIndex].trim().toLowerCase();

	  const match = currentLine.match(new RegExp(`^(\\d+)?\\s*${getUnit().replace(".", "\\.")}?\\s*(.*)$`, "i"));
	  const currentItem = match && match[2] ? match[2].toLowerCase().trim() : "";

	  if (currentItem === selectedText) return; // Let Enter insert new line

	  e.preventDefault();
	  insertSelectedSuggestion(selectedItem.textContent);
	}




    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === selectedIndex);
    });
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
      if (cursor >= charCount && cursor <= charCount + line.length) {
        let match = line.match(new RegExp(`^(\\d+)\\s*${getUnit().replace(".", "\\.")}\\s+(.*)`));
        if (match) {
          let qty = parseInt(match[1]);
          qty += e.key === "ArrowUp" ? 1 : -1;
          if (qty < 1) qty = 1;
          lines[i] = `${qty} ${getUnit()} ${match[2]}`;
          textarea.value = lines.join("\n");
          textarea.selectionStart = textarea.selectionEnd = cursor;
          break;
        }
      }
      charCount += line.length + 1;
    }
  }
  
  // Ctrl + 1: Auto-format unformatted lines 
  if (e.ctrlKey && e.key === "1") {
    e.preventDefault();
    const lines = textarea.value.split("\n");
    const fixedLines = lines.map((line) => autoFixLine(line)).join("\n");
    textarea.value = capitalizeItemLines(fixedLines);
  }

  // Ctrl + Space: Cycle tags
  if (e.ctrlKey && e.code === "Space") {
    e.preventDefault();

    const cursor = textarea.selectionStart;
    const lines = textarea.value.split("\n");

    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = charCount;
      const lineEnd = charCount + lines[i].length;

      if (cursor >= lineStart && cursor <= lineEnd + 1) {
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
      messageBox.style.backgroundColor = "#f8d7da"; // red background for error
      messageBox.style.color = "#721c24";           // dark red text
      messageBox.style.border = "1px solid #f5c6cb";
      setTimeout(() => {
        messageBox.classList.add("hidden");
      }, 3500);
    });
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

  // Fix known typos
  line = line.replace(/\buten sukker\b|\(uten sukker\)/gi, "u/sukker");
  line = line.replace(/\bmalk\b/gi, "melk");

  // We'll only replace "melk" if the line is either:
  // - exactly "melk" or "number melk"
  // - or line is exactly "number melk" with no extra words
  // So if there are other words before "melk" (like "sjoko melk"), do NOT replace.

  // Match lines with optional number + "melk" ONLY:
  if (/^\d*\s*melk$/i.test(line.trim())) {
    line = line.replace(/melk$/i, "lett melk");
  }

  line = line.trim();
  if (!line) return "";

  const normalizedGroceries = groceries.map(g => g.toLowerCase());

  // Match format: "1 lett melk"
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (match) {
    const quantity = match[1];
    const itemName = match[2].toLowerCase().trim();
    if (normalizedGroceries.includes(itemName)) {
      return `${quantity} ${getUnit()} ${capitalizeWords(itemName)}`;
    }
  }

  // Match: "lett melk" (no quantity)
  if (normalizedGroceries.includes(line.toLowerCase())) {
    return `1 ${getUnit()} ${capitalizeWords(line.toLowerCase())}`;
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
