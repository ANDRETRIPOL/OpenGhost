(() => {
'use strict';

const KEYWORDS = new Set(`abstract and as assert async await break case catch class const constructor continue def default defer
 del delete do done elif else end enum esac except export extends extern fi final finally fn for foreach from func function
 get go goto if impl implements import in instanceof interface is lambda let loop match mod module mut namespace new nil not
 of operator or override package pass private protected pub public raise readonly ref require return select set static
 struct super switch then throw throws trait try type typeof unless unsafe until use using var virtual when where while with
 yield echo local begin rescue ensure self Self this true false True False None null undefined NULL nullptr void`.split(/\s+/));
const SQL = new Set(`select from where insert into update delete create alter drop table index view values set join left right
 inner outer full cross on group by order having limit offset as distinct union all and or not null is in exists like between
 case when then else end primary key foreign references default unique constraint returning with asc desc count sum avg min max`.split(/\s+/));
const TYPES = new Set(`int integer float double long short char byte bool boolean string str number bigint symbol object any
 unknown never usize isize u8 u16 u32 u64 u128 i8 i16 i32 i64 i128 f32 f64 uint list dict tuple set map vec option result`.split(/\s+/));

const HASH = new Set(['py', 'python', 'rb', 'ruby', 'sh', 'bash', 'shell', 'zsh', 'fish', 'console', 'yaml', 'yml', 'toml', 'r',
 'perl', 'pl', 'ps1', 'powershell', 'pwsh', 'dockerfile', 'docker', 'makefile', 'make', 'ini', 'conf', 'nginx', 'elixir', 'ex',
 'julia', 'nim', 'cmake', 'coffee', 'graphql', 'gql', 'tcl', 'properties', 'env', 'gitignore']);
const DASH = new Set(['sql', 'mysql', 'postgres', 'postgresql', 'psql', 'sqlite', 'plsql', 'lua', 'haskell', 'hs', 'elm', 'ada']);
const MARKUP = new Set(['html', 'xml', 'svg', 'xhtml', 'vue', 'svelte', 'astro', 'plist']);
const PLAIN = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'md', 'markdown', 'log', 'output', 'csv']);

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = text => text.replace(/[&<>"]/g, c => ENTITIES[c]);
const wrap = (kind, text) => `<span class="hl-${kind}">${escapeHtml(text)}</span>`;

const TICK = '`';
const STRING = String.raw`"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|` + TICK + String.raw`(?:\\[\s\S]|[^\\` + TICK + String.raw`])*` + TICK + '?';
const NUMBER = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)\b`;
const COMMENTS = {
 hash: String.raw`#[^\n]*`,
 dash: String.raw`--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`,
 slash: String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`,
};
const patterns = {};

function pattern(family) {
 return patterns[family] ||= new RegExp(`(${COMMENTS[family]})|(${STRING})|(${NUMBER})|([A-Za-z_$][\\w$]*)|([^])`, 'g');
}

function code(source, lang) {
 lang = (lang || '').toLowerCase();
 if (PLAIN.has(lang)) return escapeHtml(source);
 if (lang === 'diff' || lang === 'patch') return diff(source);
 if (MARKUP.has(lang)) return markup(source);
 const family = HASH.has(lang) ? 'hash' : DASH.has(lang) ? 'dash' : 'slash', sql = DASH.has(lang) && lang !== 'lua';
 const re = pattern(family);
 let out = '', plain = '', m;
 re.lastIndex = 0;
 const flush = () => { if (plain) { out += escapeHtml(plain); plain = ''; } };
 while ((m = re.exec(source))) {
  const [token, comment, string, number, word] = m;
  if (comment) { flush(); out += wrap('comment', token); continue; }
  if (string) { flush(); out += wrap('string', token); continue; }
  if (number) { flush(); out += wrap('number', token); continue; }
  if (word) {
   const lower = word.toLowerCase();
   if (sql ? SQL.has(lower) : KEYWORDS.has(word)) { flush(); out += wrap('keyword', word); continue; }
   if (TYPES.has(lower) || /^[A-Z][a-z0-9]\w*$/.test(word)) { flush(); out += wrap('type', word); continue; }
   if (/^\s*\(/.test(source.slice(re.lastIndex, re.lastIndex + 4))) { flush(); out += wrap('function', word); continue; }
   if (source[m.index - 1] === '.' || source[m.index - 1] === '@') { flush(); out += wrap('property', word); continue; }
  }
  plain += token;
 }
 flush();
 return out;
}

function markup(source) {
 let out = '', last = 0;
 const tags = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z!?][^>]*>?/g;
 for (let m; (m = tags.exec(source));) {
  out += escapeHtml(source.slice(last, m.index));
  last = tags.lastIndex;
  const tag = m[0];
  if (tag.startsWith('<!--')) { out += wrap('comment', tag); continue; }
  const parts = /^(<\/?)([^\s>/]*)([\s\S]*?)(\/?>)?$/.exec(tag);
  out += escapeHtml(parts[1]) + wrap('keyword', parts[2]);
  out += parts[3].replace(/("[^"]*"?|'[^']*'?)|([^\s=]+)(?==)|([^])/g, (token, string, name) =>
   string ? wrap('string', string) : name ? wrap('property', name) : escapeHtml(token));
  out += escapeHtml(parts[4] || '');
 }
 return out + escapeHtml(source.slice(last));
}

function diff(source) {
 return source.split('\n').map(line => {
  if (/^(\+\+\+|---|@@)/.test(line)) return wrap('comment', line);
  if (line.startsWith('+')) return wrap('inserted', line);
  if (line.startsWith('-')) return wrap('deleted', line);
  return escapeHtml(line);
 }).join('\n');
}

window.Highlight = { code };
})();
