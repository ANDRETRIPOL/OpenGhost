(() => {
'use strict';

const TONES = {
 blue: '100, 160, 255',
 steel: '138, 170, 222',
 indigo: '134, 142, 255',
 violet: '168, 140, 255',
 purple: '196, 138, 250',
 pink: '255, 132, 184',
 red: '255, 112, 104',
 orange: '255, 158, 92',
 amber: '255, 196, 92',
 yellow: '236, 212, 98',
 green: '112, 204, 132',
 mint: '92, 212, 184',
 teal: '84, 196, 222',
 cyan: '104, 202, 255',
 brown: '204, 162, 122',
 gray: '168, 170, 180',
};

const GLYPHS = {
 code: '<path class="stroke" d="M13.2 16.2 10.5 19l2.7 2.8M18.8 16.2l2.7 2.8-2.7 2.8M16.9 15l-1.8 8"/>',
 braces: '<path class="stroke" d="M13.6 14.6c-1.3 0-1.9.6-1.9 1.8v.9c0 .9-.4 1.5-1.2 1.7.8.2 1.2.8 1.2 1.7v.9c0 1.2.6 1.8 1.9 1.8M18.4 14.6c1.3 0 1.9.6 1.9 1.8v.9c0 .9.4 1.5 1.2 1.7-.8.2-1.2.8-1.2 1.7v.9c0 1.2-.6 1.8-1.9 1.8"/>',
 terminal: '<path class="stroke" d="M11.2 16l3 3-3 3M16.2 22.4h4.6"/>',
 text: '<path class="stroke" d="M11 15.4h10M11 18.6h10M11 21.8h6.4"/>',
 sheet: '<path class="stroke" d="M11 15h10v8H11zM11 19h10M15.4 15v8"/>',
 slides: '<path class="stroke" d="M10.6 14.8h10.8v6.8H10.6zM16 21.6v2.2M13.6 23.8h4.8"/>',
 pdf: '<path class="stroke" d="M11 15.4h10M11 18.6h10M11 21.8h10"/>',
 image: '<path class="fill" d="M10.6 23.2l3.4-4 2.4 2.5 1.9-1.9 3.1 3.4z"/><circle class="fill" cx="19" cy="15.9" r="1.5"/>',
 audio: '<path class="stroke" d="M14.6 22.2v-6.8l6-1.4v6.6"/><circle class="fill" cx="13.1" cy="22.2" r="1.6"/><circle class="fill" cx="19.1" cy="20.6" r="1.6"/>',
 video: '<path class="fill" d="M14 15.3c0-.6.7-1 1.2-.7l5.6 3.7c.5.3.5 1 0 1.4l-5.6 3.7c-.5.3-1.2 0-1.2-.7z"/>',
 archive: '<path class="stroke" d="M16 12.6v1.4M16 15.4v1.4M16 18.2v1.4"/><path class="stroke" d="M14.7 21h2.6v2.8h-2.6z"/>',
 font: '<path class="stroke" d="M11.6 23.4 15.1 14.6h1.8l3.5 8.8M12.9 20.4h6.2"/>',
 binary: '<path class="stroke" d="M16 14l4.6 2.5v5L16 24l-4.6-2.5v-5zM11.4 16.5 16 19l4.6-2.5M16 19v5"/>',
 book: '<path class="stroke" d="M10.8 15.4c1.9-.7 3.6-.5 5.2.7 1.6-1.2 3.3-1.4 5.2-.7v7.6c-1.9-.7-3.6-.5-5.2.7-1.6-1.2-3.3-1.4-5.2-.7zM16 16.1v7.6"/>',
};

const PAGE = 'M7 1.5h13.2L29.5 10.8V34a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 34V6A4.5 4.5 0 0 1 7 1.5z';

const KIND_NAMES = {
 code: 'Code', braces: 'Data', terminal: 'Script', text: 'Text', sheet: 'Spreadsheet', slides: 'Presentation',
 pdf: 'PDF', image: 'Image', audio: 'Audio', video: 'Video', archive: 'Archive', font: 'Font', binary: 'App', book: 'Book',
};

const TYPES = {};
const define = (list, tone, glyph, name) => { for (const ext of list.split(' ')) TYPES[ext] = { tone, glyph, name }; };
define('py pyw pyi', 'blue', 'code', 'Python');
define('ipynb', 'orange', 'code', 'Jupyter Notebook');
define('js mjs cjs', 'yellow', 'code', 'JavaScript');
define('jsx', 'yellow', 'code', 'JavaScript React');
define('ts mts cts', 'indigo', 'code', 'TypeScript');
define('tsx', 'indigo', 'code', 'TypeScript React');
define('c h', 'steel', 'code', 'C');
define('cpp cc cxx c++ hpp hh hxx h++ ino', 'violet', 'code', 'C++');
define('cs csx', 'purple', 'code', 'C#');
define('m mm', 'steel', 'code', 'Objective-C');
define('java', 'orange', 'code', 'Java');
define('kt kts', 'purple', 'code', 'Kotlin');
define('scala sc', 'red', 'code', 'Scala');
define('swift', 'orange', 'code', 'Swift');
define('go', 'teal', 'code', 'Go');
define('rs', 'brown', 'code', 'Rust');
define('rb erb rake gemspec', 'red', 'code', 'Ruby');
define('php', 'indigo', 'code', 'PHP');
define('dart', 'cyan', 'code', 'Dart');
define('lua', 'indigo', 'code', 'Lua');
define('r rmd', 'blue', 'code', 'R');
define('jl', 'purple', 'code', 'Julia');
define('pl pm', 'steel', 'code', 'Perl');
define('ex exs', 'purple', 'code', 'Elixir');
define('erl hrl', 'red', 'code', 'Erlang');
define('hs', 'purple', 'code', 'Haskell');
define('clj cljs edn', 'green', 'code', 'Clojure');
define('elm', 'teal', 'code', 'Elm');
define('zig', 'amber', 'code', 'Zig');
define('nim', 'yellow', 'code', 'Nim');
define('fs fsx', 'cyan', 'code', 'F#');
define('vb bas', 'steel', 'code', 'Visual Basic');
define('sol', 'gray', 'code', 'Solidity');
define('asm s', 'gray', 'code', 'Assembly');
define('wat', 'purple', 'code', 'WebAssembly');
define('vue', 'green', 'code', 'Vue');
define('svelte', 'orange', 'code', 'Svelte');
define('astro', 'orange', 'code', 'Astro');
define('glsl hlsl frag vert wgsl shader', 'mint', 'code', 'Shader');
define('cmake gradle', 'green', 'code', 'Build script');
define('dockerfile', 'cyan', 'code', 'Dockerfile');
define('makefile mk', 'gray', 'terminal', 'Makefile');
define('sh bash zsh fish', 'green', 'terminal', 'Shell script');
define('ps1 psm1 psd1', 'blue', 'terminal', 'PowerShell');
define('bat cmd', 'gray', 'terminal', 'Batch file');
define('html htm xhtml', 'orange', 'code', 'HTML');
define('xml xsl xslt plist xaml', 'orange', 'code', 'XML');
define('svg', 'amber', 'code', 'SVG');
define('css', 'cyan', 'braces', 'CSS');
define('scss sass less styl', 'pink', 'braces', 'Stylesheet');
define('json jsonc json5', 'amber', 'braces', 'JSON');
define('jsonl ndjson', 'amber', 'braces', 'JSON Lines');
define('yaml yml', 'pink', 'braces', 'YAML');
define('toml', 'brown', 'braces', 'TOML');
define('ini cfg conf env properties editorconfig', 'gray', 'braces', 'Config');
define('gitignore gitattributes gitmodules dockerignore npmrc', 'gray', 'braces', 'Config');
define('lock', 'gray', 'braces', 'Lockfile');
define('sql psql', 'teal', 'braces', 'SQL');
define('graphql gql', 'pink', 'braces', 'GraphQL');
define('proto', 'blue', 'braces', 'Protocol Buffers');
define('csv tsv', 'green', 'sheet', 'Table');
define('txt text log', 'gray', 'text', 'Text');
define('md mdx markdown rst adoc', 'steel', 'text', 'Markdown');
define('tex bib', 'teal', 'text', 'LaTeX');
define('rtf', 'blue', 'text', 'Rich Text');
define('srt vtt', 'gray', 'text', 'Subtitles');
define('doc docx odt pages', 'blue', 'text', 'Document');
define('xls xlsx xlsm ods numbers', 'green', 'sheet', 'Spreadsheet');
define('ppt pptx odp key', 'orange', 'slides', 'Presentation');
define('pdf', 'red', 'pdf', 'PDF');
define('epub mobi fb2', 'purple', 'book', 'Book');
define('png jpg jpeg jfif gif webp heic heif avif bmp tif tiff ico', 'mint', 'image', 'Image');
define('psd ai sketch fig xd', 'violet', 'image', 'Design');
define('mp3 wav flac aac m4a ogg opus aiff wma', 'pink', 'audio', 'Audio');
define('mp4 mov m4v avi mkv webm wmv flv', 'purple', 'video', 'Video');
define('zip rar 7z tar gz tgz bz2 xz zst', 'brown', 'archive', 'Archive');
define('dmg iso img', 'gray', 'archive', 'Disk image');
define('ttf otf woff woff2', 'gray', 'font', 'Font');
define('exe msi dll so dylib bin app apk ipa deb rpm wasm jar class o', 'gray', 'binary', 'App');

const NAMES = { dockerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile', license: 'txt', readme: 'txt', changelog: 'txt', procfile: 'conf', gemfile: 'rb', rakefile: 'rb' };
const LABELS = { dockerfile: 'DOCK', makefile: 'MAKE', gitignore: 'GIT', gitattributes: 'GIT', gitmodules: 'GIT', dockerignore: 'DOCK', editorconfig: 'CFG', npmrc: 'NPM', 'c++': 'C++', 'h++': 'H++' };
const MIME = [[/^image\//, 'png'], [/^audio\//, 'mp3'], [/^video\//, 'mp4'], [/^text\//, 'txt'], [/json/, 'json'], [/pdf/, 'pdf'], [/zip|compressed/, 'zip']];

function extension(name) {
 const lower = name.toLowerCase(), base = lower.split(/[\\/]/).pop();
 if (NAMES[base]) return { ext: NAMES[base], label: LABELS[base] || NAMES[base] };
 const dot = base.lastIndexOf('.');
 if (dot < 0) return { ext: '', label: '' };
 const ext = base.slice(dot + 1);
 return { ext, label: LABELS[ext] || ext };
}

function describe(name, mime = '') {
 let { ext, label } = extension(name);
 let type = TYPES[ext];
 if (!type) {
  const guess = MIME.find(([re]) => re.test(mime));
  type = guess ? TYPES[guess[1]] : { tone: 'gray', glyph: 'text', name: '' };
 }
 label = label.toUpperCase().slice(0, 5) || (type.glyph === 'image' ? 'IMG' : 'FILE');
 return { ext, label, glyph: type.glyph, tone: TONES[type.tone], name: type.name || (ext ? `${ext.toUpperCase()} file` : KIND_NAMES[type.glyph] || 'File') };
}

function icon(info) {
 const size = info.label.length <= 3 ? 7.6 : info.label.length === 4 ? 6.6 : 5.6;
 return `<svg class="file-icon" viewBox="0 0 32 40" style="--ft:${info.tone}" aria-hidden="true">`
  + `<path class="file-icon-base" d="${PAGE}"/><path class="file-icon-page" d="${PAGE}"/>`
  + '<path class="file-icon-fold" d="M20.2 1.5v5.8a3.5 3.5 0 0 0 3.5 3.5h5.8z"/>'
  + `<g class="file-icon-glyph">${GLYPHS[info.glyph] || GLYPHS.text}</g>`
  + `<text class="file-icon-ext" x="16" y="33.6" text-anchor="middle" style="font-size:${size}px">${info.label.replace(/[&<>]/g, '')}</text></svg>`;
}

function formatSize(bytes) {
 if (bytes < 1000) return `${bytes} B`;
 const units = ['KB', 'MB', 'GB'];
 let value = bytes / 1000, unit = 0;
 while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
 return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`;
}

window.FileKinds = { describe, icon, formatSize };
})();
