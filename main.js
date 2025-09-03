// --- State ---
const state = {
    movies: [], // { id, title, elo, played }
    titleKey: 'title',
    eloKey: 'elo',
    history: [], // stack of {leftId,rightId, leftBefore,rightBefore, result}
    currentPair: null
};

// --- Helpers ---
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = n => Math.round(n);

function shuffle(a) { 
    for (let i = a.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function expected(rA, rB) { return 1 / (1 + Math.pow(10, (rB - rA) / 400)); }

function updateElo(a, b, result, k) {
    // result: 1 if a wins, 0 if a loses, 0.5 tie
    const eA = expected(a.elo, b.elo);
    const eB = expected(b.elo, a.elo);
    const rA = a.elo + k * (result - eA);
    const rB = b.elo + k * ((1 - result) - eB);
    a.elo = rA; b.elo = rB;
    a.played = (a.played || 0) + 1; b.played = (b.played || 0) + 1;
}

function pickPair() {
    // Find the minimum play count
    const minPlayed = Math.min(...state.movies.map(m => (typeof m.played === 'number' ? m.played : 0)));
    // Filter movies with the minimum play count
    const candidates = state.movies.filter(m => ((typeof m.played === 'number' ? m.played : 0) === minPlayed));
    if (candidates.length < 2) {
        // Fallback: pick any two movies
        // Ensure played is initialized
        state.movies.forEach(m => { if (typeof m.played !== 'number') m.played = 0; });
        return state.movies.slice(0, 2);
    }
    // Find the pair with the smallest ELO difference
    let minDiff = Infinity;
    let pair = [candidates[0], candidates[1]];
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const diff = Math.abs(candidates[i].elo - candidates[j].elo);
            if (diff < minDiff) {
                minDiff = diff;
                pair = [candidates[i], candidates[j]];
            }
        }
    }
    return pair;
}

function renderTable() {
    const tbody = $('#moviesTable tbody');
    tbody.innerHTML = '';
    const sorted = state.movies.slice().sort((a, b) => b.elo - a.elo);
    sorted.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(m.title)}</td><td>${fmt(m.elo)}</td><td>${m.played || 0}</td>`;
        tbody.appendChild(tr);
    })
}

function renderMatchup(pair) {
    if (!pair) { $('#matchup').classList.add('hidden'); $('#emptyState').classList.remove('hidden'); return; }
    $('#emptyState').classList.add('hidden');
    $('#matchup').classList.remove('hidden');
    const [L, R] = pair;
    $('#leftTitle').textContent = L.title;
    $('#rightTitle').textContent = R.title;
    $('#leftElo').textContent = `ELO: ${fmt(L.elo)}`;
    $('#rightElo').textContent = `ELO: ${fmt(R.elo)}`;
}

function nextPair() {
    state.currentPair = pickPair();
    renderMatchup(state.currentPair);
}

function enableApp(enabled) {
    $('#btnStart').disabled = !enabled;
    $('#btnExport').disabled = !enabled;
    $('#btnReset').disabled = !enabled;
    $('#btnUndo').disabled = true;
}

function escapeHtml(s) {
    return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// --- CSV Import/Export ---
function loadCsv(text) {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const cols = parsed.meta.fields || [];
    state.titleKey = $('#titleCol').value.trim() || 'title';
    state.eloKey = $('#eloCol').value.trim() || 'elo';

    if (!cols.includes(state.titleKey)) {
        alert(`Couldn't find a \"${state.titleKey}\" column. Found: ${cols.join(', ')}`);
        return;
    }

    const hasElo = cols.includes(state.eloKey);
    state.movies = parsed.data.map((row, idx) => ({
        id: idx,
        title: row[state.titleKey],
        elo: hasElo && row[state.eloKey] !== '' ? Number(row[state.eloKey]) : 1000,
        played: Number(row.played) >= 0 ? Number(row.played) : 0
    })).filter(m => m.title !== undefined && m.title !== '');

    renderTable();
    enableApp(state.movies.length >= 2);
    state.history = [];
    state.currentPair = null;
    renderMatchup(null);
}

function exportCsv() {
    const eloKey = state.eloKey || 'elo';
    const rows = state.movies.map(m => ({ title: m.title, [eloKey]: Math.round(m.elo), played: m.played || 0 }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `movies_elo_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Event handlers ---
$('#csvFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadCsv(reader.result);
    reader.readAsText(file);
});

$('#btnStart').addEventListener('click', () => {
    nextPair();
});

function commitResult(result) {
    const k = Number($('#kFactor').value) || 32;
    const [L, R] = state.currentPair || [];
    if (!L || !R) return;
    const before = { l: L.elo, r: R.elo };
    updateElo(L, R, result, k);
    state.history.push({ leftId: L.id, rightId: R.id, leftBefore: before.l, rightBefore: before.r, result });
    renderTable();
    $('#btnUndo').disabled = state.history.length === 0;
    nextPair();
}

$('#btnLeft').addEventListener('click', () => commitResult(1));
$('#btnRight').addEventListener('click', () => commitResult(0));
$('#btnTie').addEventListener('click', () => commitResult(0.5));
$('#btnSkip').addEventListener('click', () => nextPair());

$('#btnUndo').addEventListener('click', () => {
    const h = state.history.pop();

    if (!h) return;

    const L = state.movies.find(m => m.id === h.leftId);
    const R = state.movies.find(m => m.id === h.rightId);
    if (L && R) {
        L.elo = h.leftBefore;
        R.elo = h.rightBefore;
        L.played--;
        R.played--;
    }

    renderTable();
    renderMatchup(state.currentPair);
    $('#btnUndo').disabled = state.history.length === 0;
});

$('#btnReset').addEventListener('click', () => {
    if (!confirm('Reset all ELO ratings to 1000 and clear history?')) return;
    state.movies.forEach(m => { m.elo = 1000; m.played = 0; });
    state.history = [];
    renderTable();
    $('#btnUndo').disabled = true;
    renderMatchup(null);
});

$('#btnExport').addEventListener('click', exportCsv);
