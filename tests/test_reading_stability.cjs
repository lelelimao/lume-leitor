const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Tracker} = require('../app/static/reading_stability.js');

test('a brief lost frame does not erase or restart a phrase', () => {
  const tracker = new Tracker();
  assert.equal(tracker.observe('A máquina executa.').committed, true);
  assert.equal(tracker.observe('').text, 'A máquina executa.');
  assert.equal(tracker.observe('A máquina executa.').committed, false);
});

test('a new phrase replaces the old one only after confirmation', () => {
  const tracker = new Tracker();
  tracker.observe('A máquina executa.');
  assert.equal(tracker.observe('O ser humano transforma.').text, 'A máquina executa.');
  assert.equal(tracker.observe('O ser humano transforma.').text, 'O ser humano transforma.');
});

test('changed numbers are not treated as the same reading', () => {
  const tracker = new Tracker();
  tracker.observe('Valor 2025 confirmado pela pesquisa');
  assert.equal(tracker.observe('Valor 2026 confirmado pela pesquisa').waiting, true);
  assert.equal(tracker.observe('Valor 2026 confirmado pela pesquisa').committed, true);
});

test('one OCR letter error does not replace the displayed text', () => {
  const tracker = new Tracker();
  tracker.observe('A inteligência amplia capacidades');
  assert.equal(tracker.observe('A inteligencia amplia capacidade').committed, false);
  assert.equal(tracker.current, 'A inteligência amplia capacidades');
});

test('varying OCR results still lead to a new reading', () => {
  const tracker = new Tracker();
  tracker.observe('Texto anterior');
  assert.equal(tracker.observe('Uma nova frase aparece').waiting, true);
  assert.equal(tracker.observe('Uma nova frase apareceu').committed, true);
  assert.equal(tracker.current, 'Uma nova frase apareceu');
});

test('one usable frame is displayed even when later frames are empty', () => {
  const tracker = new Tracker();
  assert.equal(tracker.observe('Leitura possível').text, 'Leitura possível');
  assert.equal(tracker.observe('').text, 'Leitura possível');
  assert.equal(tracker.observe('').text, 'Leitura possível');
});
