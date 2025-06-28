let groceries = [];
let currentSuggestions = [];
let selectedIndex = -1;

const textarea = document.getElementById("textarea");
const suggestionsBox = document.getElementById("suggestions");
const unitInput = document.getElementById("unitInput");

function getUnit() {
  return unitInput.value.trim() || "stk.";
}


// Load groceries
fetch("groceries.json")
  .then(res => res.json())
  .then(data => groceries = data.map(g => g.toLowerCase()))
  .catch(err => console.error("Feil ved lasting av groceries.json:", err));

function insertAtCursor(text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const currentText = textarea.value;
  textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

// Typing Suggestions
textarea.addEventListener("input", () => {
  const cursorPos = textarea.selectionStart;
  const lines = textarea.value.split("\n");
  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
  const currentLine = lines[lineIndex].trim();

  // Always extract the last word after optional quantity and "stk."
  const match = currentLine.match(/(?:\d+\s*(?:stk\.?)?\s*)?(\w{2,})$/i);
  const query = match ? match[1].toLowerCase() : "";

  currentSuggestions = query.length > 0
    ? groceries.filter(item => item.includes(query))
    : [];

  showSuggestions(currentSuggestions);
});

function showSuggestions(list) {
  suggestionsBox.innerHTML = "";

  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "index";
    li.style.color = "#666";
    li.style.padding = "6px";
    li.style.fontStyle = "italic";
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
    updatedLine = `${qty} ${getUnit()} ${word}`;
  } else {
    // Not matching, insert new
    updatedLine = `1 ${getUnit()} ${word}`;
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
    ? currentLine // already formatted, leave unchanged
    : `1 ${getUnit()} ${word}`;

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
	  const selectedText = items[selectedIndex].textContent.trim().toLowerCase();

	  const cursorPos = textarea.selectionStart;
	  const lines = textarea.value.split("\n");
	  const lineIndex = textarea.value.substring(0, cursorPos).split("\n").length - 1;
	  const currentLine = lines[lineIndex].trim().toLowerCase();

	  // Regex to extract item name from current line
	  const match = currentLine.match(new RegExp(`^(\\d+)?\\s*${getUnit().replace(".", "\\.")}?\\s*(.*)$`, "i"));
	  const currentItem = match && match[2] ? match[2].toLowerCase().trim() : "";

	  if (currentItem === selectedText) {
		// Let Enter behave normally: insert new line
		return;
	  }

	  // Otherwise, insert selected suggestion
	  e.preventDefault();
	  insertSelectedSuggestion(items[selectedIndex].textContent);
	}



    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === selectedIndex);
    });
  }

  // Auto-fix line on Enter
  if (e.key === "Enter") {
    const currentPos = textarea.selectionStart;
    const allLines = textarea.value.split("\n");
    let charCount = 0;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const lineStart = charCount;
      const lineEnd = charCount + line.length;

      if (cursor >= lineStart && cursor <= lineEnd + 1) {
        let updatedLine = autoFixLine(line.trim());
        allLines[i] = updatedLine;
        textarea.value = allLines.join("\n");

        // Set cursor to next line
        const newCursor = allLines.slice(0, i + 1).join("\n").length + 1;
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = newCursor;
        }, 0);

        break;
      }
      charCount += line.length + 1;
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


// Utility: Auto-correct line
function autoFixLine(line) {
  if (!line) return "";

  // Fix known typos
  line = line.replace(/\buten sukker\b|\(uten sukker\)/gi, "u/sukker");
  line = line.replace(/\bmalk\b/gi, "melk");

  line = line.trim();
  if (!line) return "";

  // Normalize grocery list
  const normalizedGroceries = groceries.map(g => g.toLowerCase());

  // Match format: "1 lett melk"
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (match) {
    const quantity = match[1];
    const itemName = match[2].toLowerCase().trim();
    if (normalizedGroceries.includes(itemName)) {
      return `${quantity} ${getUnit()} ${match[2]}`;

    }
  }

  // Match: "lett melk" (no quantity)
  const lineLower = line.toLowerCase();
  if (normalizedGroceries.includes(lineLower)) {
    return `1 ${getUnit()} ${line}`;
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
