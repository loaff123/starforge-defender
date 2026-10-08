import fs from 'node:fs';
import vm from 'node:vm';

// This harness executes the real inline game script. Only browser facilities
// (DOM, audio, rendering and frame scheduling) are replaced; game/input code is not.
export function loadGame(width = 390, height = 844) {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  let document;
  class Element {
    constructor(tag = 'div', attributes = {}) {
      this.tagName = tag.toUpperCase();
      this.attributes = attributes;
      this.id = attributes.id;
      this.children = [];
      this.listeners = new Map();
      this.classes = new Set((attributes.class || '').split(/\s+/));
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.captures = new Set();
      this.checked = 'checked' in attributes;
      this.disabled = false;
      this.hidden = 'hidden' in attributes;
      this.inert = false;
      this.textContent = '';
      this.classList = {
        add: (...names) => names.forEach(n => this.classes.add(n)),
        remove: (...names) => names.forEach(n => this.classes.delete(n)),
        contains: name => this.classes.has(name),
        toggle: (name, force = !this.classes.has(name)) => {
          force ? this.classes.add(name) : this.classes.delete(name);
          return force;
        }
      };
    }
    get className() { return [...this.classes].join(' '); }
    set className(value) { this.classes = new Set(value.split(/\s+/)); }
    set innerHTML(value) { this.children = []; this._html = value; }
    get innerHTML() { return this._html || ''; }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, handler) {
      this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
    }
    dispatch(type, input = {}) {
      const event = { type, target: this, currentTarget: this, pointerId: 1,
        pointerType: 'touch', button: 0, clientX: 0, clientY: 0,
        repeat: false, shiftKey: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...input };
      for (const handler of this.listeners.get(type) || []) handler(event);
      return event;
    }
    click() { if (!this.disabled) this.dispatch('click', { pointerType: 'mouse', detail: 0 }); }
    focus() { document.activeElement = this; }
    contains(other) { return this === other || this.children.some(c => c.contains(other)); }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) {
        const name = selector.slice(1).split('[')[0];
        if (!this.classes.has(name)) return false;
        const attr = selector.match(/\[([^\]]+)\]/);
        return !attr || attr[1] in this.attributes;
      }
      if (selector.includes('button')) return this.tagName === 'BUTTON' && !this.disabled;
      if (selector.includes('input')) return this.tagName === 'INPUT' && !this.disabled;
      return false;
    }
    closest(selector) {
      return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
    }
    querySelectorAll(selector) {
      const selectors = selector.split(',').map(s => s.trim());
      return this.children.flatMap(c => [
        ...(selectors.some(s => c.matches(s)) ? [c] : []), ...c.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
      if (this.id === 'movePad') return { left: 16, top: window.innerHeight - 144, width: 112, height: 112 };
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    getContext() { return new Proxy({}, { get: () => () => ({ addColorStop() {} }) }); }
  }

  const root = new Element('body');
  const stack = [root];
  const ids = new Map();
  const markup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>'));
  for (const match of markup.matchAll(/<\/?([\w-]+)([^>]*)>/g)) {
    const [token, tag, text] = match;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const attr of text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
    const element = new Element(tag, attrs);
    stack.at(-1).appendChild(element);
    if (element.id) ids.set(element.id, element);
    if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(element);
  }
  document = new Element('document');
  document.body = root;
  document.activeElement = root;
  document.hidden = false;
  document.getElementById = id => ids.get(id) || null;
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.createElement = tag => new Element(tag);
  const window = new Element('window');
  window.innerWidth = width;
  window.innerHeight = height;
  window.devicePixelRatio = 1;
  window.matchMedia = () => ({ matches: width <= 840, addEventListener() {} });
  window.AudioContext = class {
    state = 'running'; currentTime = 0;
    createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { exponentialRampToValueAtTime() {} }, connect() {} }; }
  };
  const sandbox = vm.createContext({ document, window, console, performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {} });
  vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], sandbox);
  return {
    read: expression => vm.runInContext(expression, sandbox),
    run: source => vm.runInContext(source, sandbox),
    element: id => ids.get(id),
    emit: (id, type, event) => {
      const element = ids.get(id);
      if (!element) throw new Error(`Missing control: ${id}`);
      return element.dispatch(type, event);
    },
    start: () => ids.get('startButton').click(),
    window, document, html
  };
}
