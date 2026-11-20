
const subscribers = new Map(); // sessionId -> Set<res>
const HEARTBEAT_MS = 25000;

function subscribe(sessionId, req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  const set = subscribers.get(sessionId);
  set.add(res);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (set.size === 0) subscribers.delete(sessionId);
  });
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publish(sessionId, payload) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  set.forEach((res) => {
    try {
      send(res, payload);
    } catch (e) {
      set.delete(res);
    }
  });
}

function hasSubscribers(sessionId) {
  const set = subscribers.get(sessionId);
  return !!set && set.size > 0;
}

module.exports = { subscribe, send, publish, hasSubscribers };