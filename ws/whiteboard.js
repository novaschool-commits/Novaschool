// Lightweight real-time layer for the virtual classroom whiteboard.
//
// Design: strokes travel over the socket only and are NEVER written to the
// database — the teacher's client periodically sends a full-page PNG
// snapshot (debounced client-side, see the frontend timer), and that's the
// only thing persisted. This keeps DB load flat no matter how much a
// teacher draws, per the "avoid per-stroke writes" requirement.
//
// Rooms are in-memory only (keyed by whiteboardId) and rebuilt from
// whichever clients are currently connected — nothing here needs to
// survive a server restart, since the persisted snapshot in
// whiteboard_pages is the source of truth for anyone who (re)joins.

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { SECRET } = require('../middleware/auth');
const { get, all, run } = require('../db');

const rooms = new Map(); // whiteboardId -> { clients: Map(ws -> joinedInfo), currentPageId, allowStudentDraw }

function getRoom(whiteboardId) {
  if (!rooms.has(whiteboardId)) {
    rooms.set(whiteboardId, { clients: new Map(), currentPageId: null, allowStudentDraw: false });
  }
  return rooms.get(whiteboardId);
}

function broadcast(whiteboardId, data, exceptWs) {
  const room = rooms.get(whiteboardId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const clientWs of room.clients.keys()) {
    if (clientWs !== exceptWs && clientWs.readyState === 1) clientWs.send(msg);
  }
}

// Only a teacher who owns the whiteboard, or a student in its section,
// may join. Server-side check — never trust a client-supplied role alone.
async function verifyAccess(userId, role, whiteboardId) {
  const wb = await get('SELECT * FROM whiteboards WHERE id = $1', [whiteboardId]);
  if (!wb) return null;
  if (role === 'teacher') {
    const teacher = await get('SELECT id FROM teachers WHERE user_id = $1', [userId]);
    if (!teacher || teacher.id !== wb.teacher_id) return null;
    return { wb, isTeacher: true };
  }
  if (role === 'student') {
    const student = await get('SELECT id, section_code FROM students WHERE user_id = $1', [userId]);
    if (!student || student.section_code !== wb.section_code) return null;
    return { wb, isTeacher: false };
  }
  return null;
}

function attachWhiteboardWS(server) {
  const wss = new WebSocketServer({ server, path: '/ws/whiteboard' });

  wss.on('connection', (ws) => {
    let joined = null; // { whiteboardId, userId, role, isTeacher }

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join') {
        let payload;
        try { payload = jwt.verify(msg.token, SECRET); }
        catch { ws.send(JSON.stringify({ type: 'error', error: 'Invalid or expired session.' })); return; }

        const access = await verifyAccess(payload.id, payload.role, msg.whiteboardId);
        if (!access) { ws.send(JSON.stringify({ type: 'error', error: 'You do not have access to this whiteboard.' })); return; }

        joined = { whiteboardId: msg.whiteboardId, userId: payload.id, role: payload.role, isTeacher: access.isTeacher };
        const room = getRoom(msg.whiteboardId);
        room.clients.set(ws, joined);
        room.allowStudentDraw = access.wb.allow_student_draw;

        const pages = await all('SELECT id, position, snapshot FROM whiteboard_pages WHERE whiteboard_id = $1 ORDER BY position', [msg.whiteboardId]);
        if (!room.currentPageId && pages.length) {
          // Resume exactly where the class left off, not just page 1 —
          // access.wb.current_page_id survives even when the in-memory
          // room was freed (everyone disconnected) and rebuilt fresh.
          const resumeId = access.wb.current_page_id;
          room.currentPageId = (resumeId && pages.some(p => p.id === resumeId)) ? resumeId : pages[0].id;
        }
        const currentPage = pages.find(p => p.id === room.currentPageId);

        ws.send(JSON.stringify({
          type: 'state',
          pages: pages.map(p => ({ id: p.id, position: p.position })),
          currentPageId: room.currentPageId,
          snapshot: currentPage ? currentPage.snapshot : null,
          allowStudentDraw: room.allowStudentDraw,
          isTeacher: access.isTeacher
        }));
        broadcast(msg.whiteboardId, { type: 'presence', count: room.clients.size }, null);
        return;
      }

      if (!joined) return; // every other message type requires a prior successful join
      const room = getRoom(joined.whiteboardId);
      const canDraw = joined.isTeacher || room.allowStudentDraw;

      if (msg.type === 'stroke' && canDraw) {
        broadcast(joined.whiteboardId, { type: 'stroke', points: msg.points, color: msg.color, size: msg.size, tool: msg.tool, from: joined.userId }, ws);
      } else if (msg.type === 'clear' && joined.isTeacher) {
        broadcast(joined.whiteboardId, { type: 'clear' }, ws);
      } else if (msg.type === 'snapshot' && joined.isTeacher) {
        // Debounced persistence — the client sends this every ~8s while
        // drawing, plus on page switch and on class end. Not per-stroke.
        if (!room.currentPageId) return;
        try {
          await run('UPDATE whiteboard_pages SET snapshot = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [msg.dataUrl, room.currentPageId]);
          await run('UPDATE whiteboards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [joined.whiteboardId]);
        } catch (err) { console.error('Whiteboard snapshot save failed:', err); }
      } else if (msg.type === 'addPage' && joined.isTeacher) {
        const maxPos = await get('SELECT COALESCE(MAX(position), -1) AS m FROM whiteboard_pages WHERE whiteboard_id = $1', [joined.whiteboardId]);
        const newPage = await get('INSERT INTO whiteboard_pages (whiteboard_id, position) VALUES ($1,$2) RETURNING id, position', [joined.whiteboardId, Number(maxPos.m) + 1]);
        room.currentPageId = newPage.id;
        await run('UPDATE whiteboards SET current_page_id = $1 WHERE id = $2', [newPage.id, joined.whiteboardId]);
        broadcast(joined.whiteboardId, { type: 'pageAdded', pageId: newPage.id, position: newPage.position }, null);
      } else if (msg.type === 'switchPage' && joined.isTeacher) {
        const page = await get('SELECT id, snapshot FROM whiteboard_pages WHERE id = $1 AND whiteboard_id = $2', [msg.pageId, joined.whiteboardId]);
        if (!page) return;
        room.currentPageId = page.id;
        await run('UPDATE whiteboards SET current_page_id = $1 WHERE id = $2', [page.id, joined.whiteboardId]);
        broadcast(joined.whiteboardId, { type: 'pageSwitched', pageId: page.id, snapshot: page.snapshot || null }, null);
      } else if (msg.type === 'toggleStudentDraw' && joined.isTeacher) {
        room.allowStudentDraw = !!msg.allow;
        await run('UPDATE whiteboards SET allow_student_draw = $1 WHERE id = $2', [room.allowStudentDraw, joined.whiteboardId]);
        broadcast(joined.whiteboardId, { type: 'permissions', allowStudentDraw: room.allowStudentDraw }, null);
      }
    });

    ws.on('close', () => {
      if (!joined) return;
      const room = rooms.get(joined.whiteboardId);
      if (!room) return;
      room.clients.delete(ws);
      broadcast(joined.whiteboardId, { type: 'presence', count: room.clients.size }, null);
      if (room.clients.size === 0) rooms.delete(joined.whiteboardId); // free memory once everyone's left
    });
  });

  return wss;
}

module.exports = { attachWhiteboardWS };
