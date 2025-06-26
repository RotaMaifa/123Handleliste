
let groceries = [];
let userSuggestions = [];
let currentSuggestions = [];
let selectedIndex = -1;

const textarea = document.getElementById("textarea");
const suggestionsBox = document.getElementById("suggestions");
const themeSelector = document.getElementById("theme");

// Load groceries
fetch("groceries.json")
  .then(res => res.json())
  .then(data => groceries = data)
  .catch(err => console.error("Feil ved lasting av groceries.json:", err));

// Insert word at cursor
function insertAtCursor(text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const currentText = textarea.value;
  textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

// Handle typing
textarea.addEventListener("input", () => {
  const cursorPos = textarea.selectionStart;
  const textUptoCursor = textarea.value.substring(0, cursorPos);
  const words = textUptoCursor.split(/\s|\n/);
  const currentWord = words[words.length - 1];

  if (currentWord.length >= 1) {
    const lowerWord = currentWord.toLowerCase();
    currentSuggestions = groceries.filter(item =>
      item.toLowerCase().startsWith(lowerWord)
    );
    showSuggestions(currentSuggestions);
  } else {
    suggestionsBox.style.display = "none";
  }
});


function showSuggestions(list) {
  suggestionsBox.innerHTML = "";
  if (list.length === 0) {
    suggestionsBox.style.display = "none";
    return;
  }

  list.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    li.addEventListener("click", () => applySuggestion(item));
    suggestionsBox.appendChild(li);
  });

  suggestionsBox.style.display = "block";
  selectedIndex = -1;
}



function applySuggestion(word) {
  const cursorPos = textarea.selectionStart;
  const text = textarea.value;
  const before = text.substring(0, cursorPos).replace(/(\S+)$/, "");
  const after = text.substring(cursorPos);
  const lineStart = text.lastIndexOf("\n", cursorPos - 1) + 1;

  const currentLine = text.substring(lineStart, cursorPos);
  const hasAmount = /^\d+ stk\./.test(currentLine);
  const amountText = hasAmount ? "" : "1 stk. ";

  textarea.value = before + amountText + word + after;
  const newPos = (before + amountText + word).length;
  textarea.selectionStart = textarea.selectionEnd = newPos;
  textarea.focus();
  suggestionsBox.style.display = "none";
}

// Keyboard navigation
textarea.addEventListener("keydown", (e) => {
  if (suggestionsBox.style.display === "block") {
    const items = suggestionsBox.querySelectorAll("li");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0) {
        e.preventDefault();
        applySuggestion(items[selectedIndex].textContent);
      }
    }

    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === selectedIndex);
    });
  }

  // Ctrl + Up/Down to change quantity
  if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const lines = textarea.value.split("\n");
    const cursor = textarea.selectionStart;
    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (cursor >= charCount && cursor <= charCount + line.length) {
        let match = line.match(/^(\d+)\s+stk\.\s+(.*)/);
        if (match) {
          let qty = parseInt(match[1]);
          qty += e.key === "ArrowUp" ? 1 : -1;
          if (qty < 1) qty = 1;
          lines[i] = `${qty} stk. ${match[2]}`;
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
  navigator.clipboard.writeText(textarea.value)
    .then(() => {
      alert("Handleliste kopiert til utklippstavlen!");
    })
    .catch(err => {
      console.error("Kopiering feilet:", err);
      alert("Kopiering mislyktes. Prøv igjen.");
    });
});


