"use strict";

// Keeps OCR noise and brief camera movement from replacing a confirmed reading.
const ReadingStability = (() => {
  function normalize(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

  function similar(first, second) {
    if (first === second) return true;
    if (!first || !second) return false;
    const numbers = (value) => value.match(/\d+/g)?.join(" ") || "";
    if (numbers(first) !== numbers(second)) return false;
    const a = first.split(" "), b = second.split(" ");
    if (a.length !== b.length) return false;
    const closeWord = (left, right) => {
      if (left === right) return true;
      if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;
      let i = 0, j = 0, edits = 0;
      while (i < left.length && j < right.length) {
        if (left[i] === right[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (left.length > right.length) i++;
        else if (right.length > left.length) j++;
        else { i++; j++; }
      }
      return true;
    };
    const matches = a.filter((word, index) => closeWord(word, b[index])).length;
    return matches / a.length >= .8;
  }

  class Tracker {
    constructor() { this.reset(); }
    reset() { this.current = ""; this.key = ""; this.candidate = ""; this.candidateKey = ""; this.hits = 0; this.misses = 0; }
    observe(raw) {
      const text = raw.trim();
      const key = normalize(text);
      if (!key) {
        this.misses++;
        // One lost frame does not discard a candidate; a long gap does.
        if (this.misses > 2) { this.candidate = ""; this.candidateKey = ""; this.hits = 0; }
        return {text: this.current, committed: false, waiting: false, missing: true};
      }
      this.misses = 0;
      // Show and speak the first usable OCR result immediately. Waiting for
      // two nearly identical results can leave a moving camera silent forever.
      if (!this.current) {
        this.current = text;
        this.key = key;
        return {text, committed: true, waiting: false, missing: false};
      }
      if (similar(key, this.key)) {
        this.candidate = ""; this.candidateKey = ""; this.hits = 0;
        return {text: this.current, committed: false, waiting: false, missing: false};
      }
      // Two consecutive readings different from the current phrase indicate a
      // new view, even when OCR varies enough that those readings differ.
      this.hits++;
      this.candidate = text;
      this.candidateKey = key;
      if (this.hits < 2) return {text: this.current, committed: false, waiting: true, missing: false};
      this.current = this.candidate;
      this.key = this.candidateKey;
      this.candidate = ""; this.candidateKey = ""; this.hits = 0;
      return {text: this.current, committed: true, waiting: false, missing: false};
    }
  }

  return {Tracker, normalize, similar};
})();

if (typeof module !== "undefined") module.exports = ReadingStability;
