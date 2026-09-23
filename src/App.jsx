import { useEffect, useRef, useState } from "react";
import {
  addPhotos,
  clearAll,
  deleteTask,
  getAllPhotos,
  getPhotos,
  getTasks,
  putTasks,
  removePhoto,
  replaceAllData,
  replaceTasks,
} from "./db.js";

const START = 300;
const END = 1380;
const PX = 2.75;
const HEAD = 48;
const DAYS = ["Day 0", "Day 1", "Day 2", "Day 3", "Day 3.5", "Day 4", "Day 5"];
const DEFAULT_LANES = ["Staff", "QM 1", "QM 2", "QM 3", "QM 4", "QM 5"];
const DEFAULT_AGENDA_COLOR = "#f7d28c";
const DEFAULT_TASK_COLOR = "#dceefb";
const ITEM_COLORS = [
  "#F7D28C",
  "#FFF2CC",
  "#E2F0D9",
  "#C6E0B4",
  "#DDEBF7",
  "#BDD7EE",
  "#D9E1F2",
  "#E4DFEC",
  "#EADCF8",
  "#FCE4D6",
  "#F8CBAD",
  "#F4CCCC",
  "#EA9999",
  "#D9D9D9",
  "#BFBFBF",
  "#FFFFFF",
];
const pad = (value) => String(value).padStart(2, "0");
const blank = (day = "Day 1") => ({
  item: "",
  location: "",
  detail: "",
  startTime: "08:00",
  duration: "30",
  day,
  assignment: "Input Bin",
  color: DEFAULT_TASK_COLOR,
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function mins(value) {
  const match = String(value || "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return 480;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3] === "pm" && hour !== 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function duration(value) {
  const text = String(value || 30).toLowerCase();
  const hours = text.match(/([\d.]+)\s*h/);
  const minutes = text.match(/([\d.]+)\s*m/);
  return Math.max(
    5,
    Math.round(
      (hours ? Number(hours[1]) * 60 : 0) +
        (minutes
          ? Number(minutes[1])
          : !hours
            ? Number(text.replace(/\D/g, "") || 30)
            : 0),
    ),
  );
}

function timeInput(value) {
  return `${pad(Math.floor(value / 60) % 24)}:${pad(value % 60)}`;
}

function showTime(value) {
  const hour = Math.floor(value / 60) % 24;
  return `${hour % 12 || 12}:${pad(value % 60)} ${hour >= 12 ? "PM" : "AM"}`;
}

function assignments(value) {
  const result = (
    Array.isArray(value) ? value : String(value || "Input Bin").split(/[,;|]/)
  )
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(result.length ? result : ["Input Bin"])];
}

function normalizeDay(value) {
  const entered = String(value || "").trim();
  return DAYS.includes(entered) ? entered : "Day 1";
}

function makeTask(row) {
  const taskAssignments = assignments(row.assignment);
  return {
    id: crypto.randomUUID(),
    item: String(row.item || "").trim(),
    location: String(row.location || "").trim(),
    detail: String(row.detail || "").trim(),
    startMinutes: mins(row.startTime),
    durationMinutes: duration(row.duration),
    day: normalizeDay(row.day),
    assignments: taskAssignments,
    color:
      row.color ||
      (taskAssignments.includes("Agenda")
        ? DEFAULT_AGENDA_COLOR
        : DEFAULT_TASK_COLOR),
    completed: false,
    pinned: false,
  };
}

function downloadFile(content, type, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  const mimeType =
    header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function ColorPalette({ value, onChange }) {
  return (
    <div
      className="colorPalette"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 30px)",
        gap: "5px",
        marginTop: "5px",
      }}
    >
      {ITEM_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={`Choose color ${color}`}
          onClick={() => onChange(color)}
          style={{
            width: "30px",
            height: "30px",
            padding: 0,
            backgroundColor: color,
            border:
              value?.toUpperCase() === color
                ? "3px solid #17324d"
                : "1px solid #7f8f9b",
            boxShadow:
              value?.toUpperCase() === color ? "0 0 0 2px white inset" : "none",
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [lanes, setLanes] = useState(
    () =>
      JSON.parse(localStorage.getItem("dispatch-lanes") || "null") ||
      DEFAULT_LANES,
  );
  const [day, setDay] = useState("Day 1");
  const [mode, setMode] = useState("event");
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState(null);
  const [manual, setManual] = useState(blank());
  const [paste, setPaste] = useState("");
  const [photos, setPhotos] = useState({});
  const [gallery, setGallery] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const scroll = useRef(null);
  const replaceRestoreInput = useRef(null);
  const mergeRestoreInput = useRef(null);

  useEffect(() => {
    getTasks().then((items) =>
      setTasks(
        items.map((task) => ({
          ...task,
          color:
            task.color ||
            (task.assignments?.includes("Agenda")
              ? DEFAULT_AGENDA_COLOR
              : DEFAULT_TASK_COLOR),
        })),
      ),
    );
  }, []);
  useEffect(() => {
    localStorage.setItem("dispatch-lanes", JSON.stringify(lanes));
  }, [lanes]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!scroll.current) return;
    const current = now.getHours() * 60 + now.getMinutes();
    scroll.current.scrollTop = Math.max(0, (current - 30 - START) * PX);
  }, [day]);

  async function refreshPhotos(id) {
    const taskPhotos = await getPhotos(id);
    setPhotos((old) => {
      (old[id] || []).forEach((photo) => URL.revokeObjectURL(photo.url));
      return {
        ...old,
        [id]: taskPhotos.map((photo) => ({
          ...photo,
          url: URL.createObjectURL(photo.blob),
        })),
      };
    });
  }

  async function refreshAllPhotos(items = tasks) {
    const next = {};
    for (const task of items) {
      const taskPhotos = await getPhotos(task.id);
      next[task.id] = taskPhotos.map((photo) => ({
        ...photo,
        url: URL.createObjectURL(photo.blob),
      }));
    }
    setPhotos((old) => {
      Object.values(old)
        .flat()
        .forEach((photo) => URL.revokeObjectURL(photo.url));
      return next;
    });
  }

  useEffect(() => {
    tasks.forEach((task) => refreshPhotos(task.id));
  }, [tasks.length]);

  function captureUndo() {
    setUndoSnapshot({ tasks: clone(tasks), lanes: clone(lanes) });
  }

  async function save(next, capture = true) {
    if (capture) captureUndo();
    const sorted = [...next].sort(
      (a, b) => a.day.localeCompare(b.day) || a.startMinutes - b.startMinutes,
    );
    setTasks(sorted);
    await replaceTasks(sorted);
  }

  const patch = (id, changes) =>
    save(
      tasks.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    );

  async function undoLastAction() {
    if (!undoSnapshot) return;
    const currentSnapshot = { tasks: clone(tasks), lanes: clone(lanes) };
    setTasks(clone(undoSnapshot.tasks));
    setLanes(clone(undoSnapshot.lanes));
    await replaceTasks(undoSnapshot.tasks);
    setUndoSnapshot(currentSnapshot);
  }

  function openEditor(task) {
    setEdit(task.id);
    setDraft({
      ...task,
      startTime: timeInput(task.startMinutes),
      duration: String(task.durationMinutes),
      color: task.color || DEFAULT_TASK_COLOR,
    });
  }

  async function saveEditor() {
    if (!edit || !draft) return;
    await patch(edit, {
      ...draft,
      startMinutes: mins(draft.startTime),
      durationMinutes: duration(draft.duration),
      day: normalizeDay(draft.day),
      assignments: draft.assignments.length ? draft.assignments : ["Input Bin"],
      color: draft.color || DEFAULT_TASK_COLOR,
    });
    setEdit(null);
    setDraft(null);
  }

  function cancelEditor() {
    setEdit(null);
    setDraft(null);
  }

  function handleEditorKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditor();
      return;
    }
    if (event.key === "Enter") {
      if (event.target.tagName === "TEXTAREA" && !event.ctrlKey) return;
      event.preventDefault();
      saveEditor();
    }
  }

  function exportTasks() {
    const rows = [
      [
        "Item",
        "Location",
        "Detail",
        "Start Time",
        "Duration",
        "Day",
        "Assignment",
        "Color",
      ].join("\t"),
    ];
    tasks.forEach((task) =>
      rows.push(
        [
          task.item,
          task.location,
          task.detail,
          showTime(task.startMinutes),
          task.durationMinutes,
          task.day,
          task.assignments.join(";"),
          task.color || "",
        ].join("\t"),
      ),
    );
    downloadFile(
      rows.join("\r\n"),
      "text/tab-separated-values",
      `ScoutDispatch-${new Date().toISOString().substring(0, 10)}.tsv`,
    );
  }

  async function backupJson() {
    const allPhotos = await getAllPhotos();
    const backupPhotos = [];
    for (const photo of allPhotos) {
      backupPhotos.push({
        id: photo.id,
        taskId: photo.taskId,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        createdAt: photo.createdAt,
        dataUrl: await blobToDataUrl(photo.blob),
      });
    }
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      lanes,
      tasks,
      photos: backupPhotos,
    };
    downloadFile(
      JSON.stringify(backup, null, 2),
      "application/json",
      `ScoutDispatch-Backup-${new Date().toISOString().substring(0, 10)}.json`,
    );
  }

  async function restoreJson(file, mode) {
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      alert("The selected file is not valid JSON.");
      return;
    }

    if (
      backup.version !== 1 ||
      !Array.isArray(backup.tasks) ||
      !Array.isArray(backup.lanes) ||
      !Array.isArray(backup.photos)
    ) {
      alert("This is not a valid Scout Dispatch Board backup.");
      return;
    }

    if (mode === "replace") {
      if (
        !confirm(
          "Replace the current board, including all photos, with this backup?",
        )
      )
        return;
      captureUndo();

      const restoredTasks = backup.tasks.map((task) => ({
        ...task,
        color:
          task.color ||
          (task.assignments?.includes("Agenda")
            ? DEFAULT_AGENDA_COLOR
            : DEFAULT_TASK_COLOR),
      }));
      const restoredPhotos = backup.photos.map((photo) => ({
        id: photo.id,
        taskId: photo.taskId,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        createdAt: photo.createdAt,
        blob: dataUrlToBlob(photo.dataUrl),
      }));

      await replaceAllData(restoredTasks, restoredPhotos);
      setTasks(restoredTasks);
      setLanes(backup.lanes);
      await refreshAllPhotos(restoredTasks);
      alert(
        `Restored ${restoredTasks.length} tasks and ${restoredPhotos.length} photos.`,
      );
      return;
    }

    if (
      !confirm(
        "Merge every task and photo from this backup into the current board?",
      )
    )
      return;
    captureUndo();

    const idMap = new Map();
    const mergedTasks = backup.tasks.map((sourceTask) => {
      const newId = crypto.randomUUID();
      idMap.set(sourceTask.id, newId);
      return {
        ...sourceTask,
        id: newId,
        color:
          sourceTask.color ||
          (sourceTask.assignments?.includes("Agenda")
            ? DEFAULT_AGENDA_COLOR
            : DEFAULT_TASK_COLOR),
      };
    });

    const importedPhotos = backup.photos
      .filter((photo) => idMap.has(photo.taskId))
      .map((photo) => ({
        id: crypto.randomUUID(),
        taskId: idMap.get(photo.taskId),
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        createdAt: photo.createdAt,
        blob: dataUrlToBlob(photo.dataUrl),
      }));

    const existingPhotos = await getAllPhotos();
    const combinedTasks = [...tasks, ...mergedTasks];
    const combinedPhotos = [...existingPhotos, ...importedPhotos];
    const combinedLanes = [...new Set([...lanes, ...backup.lanes])];

    await replaceAllData(combinedTasks, combinedPhotos);
    setTasks(combinedTasks);
    setLanes(combinedLanes);
    await refreshAllPhotos(combinedTasks);
    alert(
      `Merged ${mergedTasks.length} tasks and ${importedPhotos.length} photos.`,
    );
  }

  function startDrag(event, task, fromLane) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: task.id,
        from: fromLane,
        grabOffsetMinutes: (event.clientY - bounds.top) / PX,
        copyStarted: event.ctrlKey,
      }),
    );
    // Allow either operation. The final choice is made when the mouse is released.
    event.dataTransfer.effectAllowed = "copyMove";
  }

  function snappedTime(event, laneElement, task, grabOffsetMinutes = 0) {
    const rectangle = laneElement.getBoundingClientRect();
    const proposed =
      START + (event.clientY - rectangle.top) / PX - grabOffsetMinutes;
    return Math.max(
      START,
      Math.min(END - task.durationMinutes, Math.round(proposed / 5) * 5),
    );
  }

  async function duplicateTask(sourceTask, destinationLane, newStartMinutes) {
    const copiedTask = {
      ...sourceTask,
      id: crypto.randomUUID(),
      assignments: [destinationLane],
      startMinutes: newStartMinutes ?? sourceTask.startMinutes,
      completed: false,
      pinned: false,
    };
    await save([...tasks, copiedTask]);
    openEditor(copiedTask);
  }

  async function drop(event, toLane) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
      if (toLane !== "Agenda") return;
      const id = event.currentTarget.dataset.taskid;
      if (id) {
        await addPhotos(id, event.dataTransfer.files);
        await refreshPhotos(id);
      }
      return;
    }
    try {
      const payload = JSON.parse(
        event.dataTransfer.getData("application/json"),
      );
      const sourceTask = tasks.find((task) => task.id === payload.id);
      if (!sourceTask) return;
      const resourceDestination = toLane !== "Agenda" && toLane !== "Input Bin";
      const agendaSource = payload.from === "Agenda";
      let newStartMinutes = sourceTask.startMinutes;
      if (resourceDestination && !agendaSource) {
        newStartMinutes = snappedTime(
          event,
          event.currentTarget,
          sourceTask,
          payload.grabOffsetMinutes,
        );
      }
      // Ctrl may be pressed before the drag starts or at any point before release.
      // Holding Ctrl when dropping creates a copy; releasing Ctrl before dropping moves it.
      const copyRequested = event.ctrlKey || payload.copyStarted;
      if (copyRequested) {
        await duplicateTask(sourceTask, toLane, newStartMinutes);
        return;
      }
      let nextAssignments = sourceTask.assignments.filter(
        (lane) => lane !== payload.from,
      );
      if (!nextAssignments.includes(toLane)) nextAssignments.push(toLane);
      const changes = { assignments: nextAssignments };
      if (resourceDestination && !agendaSource)
        changes.startMinutes = newStartMinutes;
      await patch(sourceTask.id, changes);
    } catch {
      // Ignore non-task drops.
    }
  }

  async function shiftAgenda(task, delta) {
    await save(
      tasks.map((item) =>
        item.day === task.day &&
        item.assignments.includes("Agenda") &&
        item.startMinutes >= task.startMinutes
          ? { ...item, startMinutes: item.startMinutes + delta }
          : item,
      ),
    );
  }

  const dayTasks = tasks.filter((task) => task.day === day);
  const inputTasks = dayTasks
    .filter((task) => task.assignments.includes("Input Bin"))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Number(a.completed) - Number(b.completed) ||
        a.startMinutes - b.startMinutes,
    );
  const current = now.getHours() * 60 + now.getMinutes();
  const slots = [];
  for (let minute = START; minute <= END; minute += 15) slots.push(minute);

  function taskCard(task, lane) {
    const agenda = lane === "Agenda";
    const compact = task.durationMinutes <= 19;
    const large = task.durationMinutes >= 20;
    const taskPhotos = photos[task.id] || [];
    const backgroundColor = task.completed
      ? "#d8dde1"
      : task.color || (agenda ? DEFAULT_AGENDA_COLOR : DEFAULT_TASK_COLOR);

    return (
      <article
        data-taskid={task.id}
        className={`card ${agenda ? "agenda" : "resource"} ${compact ? "compact" : "large"} ${task.completed ? "done" : ""}`}
        style={{ backgroundColor }}
        draggable
        onDragStart={(event) => startDrag(event, task, lane)}
        onDragOver={
          agenda
            ? (event) => {
                if ([...event.dataTransfer.types].includes("Files"))
                  event.preventDefault();
              }
            : undefined
        }
        onDrop={
          agenda
            ? (event) => {
                if (event.dataTransfer.files?.length) {
                  event.stopPropagation();
                  drop(event, lane);
                }
              }
            : undefined
        }
        onDoubleClick={() => openEditor(task)}
      >
        <button
          className="check"
          onClick={() => patch(task.id, { completed: !task.completed })}
        >
          {task.completed ? "✓" : ""}
        </button>
        <div className="copy" onClick={() => openEditor(task)}>
          <strong>{task.item}</strong>
          {agenda && !compact && task.location && (
            <span className="location">{task.location}</span>
          )}
          {large && task.detail && (
            <div className="cardDetail">{task.detail}</div>
          )}
        </div>
        {agenda && taskPhotos.length > 0 && (
          <button
            className="photoCount"
            onClick={() => {
              setGallery(task.id);
              setGalleryIndex(0);
            }}
          >
            ▣ {taskPhotos.length}
          </button>
        )}
        {agenda && !compact && (
          <div className="shift">
            <button onClick={() => shiftAgenda(task, -5)}>−5</button>
            <button onClick={() => shiftAgenda(task, 5)}>+5</button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div>
      <header>
        <div>
          <h1>Scout Dispatch Board</h1>
          <small>{mode === "event" ? "Event mode" : "Setup mode"}</small>
        </div>
        <nav>
          {DAYS.map((item) => (
            <button
              className={item === day ? "active" : ""}
              onClick={() => setDay(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="headerActions">
          <button onClick={undoLastAction} disabled={!undoSnapshot}>
            Undo
          </button>
          <button
            className="mode"
            onClick={() => setMode(mode === "event" ? "setup" : "event")}
          >
            Switch to {mode === "event" ? "Setup" : "Event"}
          </button>
        </div>
      </header>

      <main className="board">
        <aside
          className="bin"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => drop(event, "Input Bin")}
        >
          <h2>
            Input Bin{" "}
            <b>{inputTasks.filter((item) => !item.completed).length}</b>
          </h2>
          {inputTasks.map((task) => (
            <div
              className={`punch ${task.completed ? "done" : ""}`}
              style={{ borderLeftColor: task.color || DEFAULT_TASK_COLOR }}
              draggable
              onDragStart={(event) => startDrag(event, task, "Input Bin")}
              key={task.id}
            >
              <button
                onClick={() => patch(task.id, { completed: !task.completed })}
              >
                {task.completed ? "✓" : ""}
              </button>
              <button onClick={() => patch(task.id, { pinned: !task.pinned })}>
                {task.pinned ? "●" : "○"}
              </button>
              <span onClick={() => openEditor(task)}>{task.item}</span>
            </div>
          ))}
        </aside>

        <section className="scroll" ref={scroll}>
          <div
            className="timeline"
            style={{
              gridTemplateColumns: `68px 230px repeat(${lanes.length},170px)`,
              height: (END - START) * PX + HEAD,
            }}
          >
            <div className="timeHead">Time</div>
            <div className="laneHead agendaHead">Agenda</div>
            {lanes.map((lane) => (
              <div className="laneHead" key={lane}>
                {lane}
              </div>
            ))}
            <div className="axis">
              {slots.map((minute) => (
                <span style={{ top: (minute - START) * PX }} key={minute}>
                  {showTime(minute)}
                </span>
              ))}
            </div>
            {["Agenda", ...lanes].map((lane, index) => (
              <div
                className={`lane ${lane === "Agenda" ? "agendaLane" : ""}`}
                style={{ gridColumn: index + 2 }}
                key={lane}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, lane)}
              >
                {slots.map((minute) => (
                  <i
                    className="line"
                    style={{ top: (minute - START) * PX }}
                    key={minute}
                  />
                ))}
                {dayTasks
                  .filter((task) => task.assignments.includes(lane))
                  .map((task) => (
                    <div
                      className="position"
                      style={{
                        top: (task.startMinutes - START) * PX + 2,
                        height: Math.max(18, task.durationMinutes * PX - 4),
                      }}
                      key={task.id}
                    >
                      {taskCard(task, lane)}
                    </div>
                  ))}
              </div>
            ))}
            {current >= START && current <= END && (
              <div
                className="now"
                style={{ top: HEAD + (current - START) * PX }}
              >
                <span>NOW {showTime(current)}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      {mode === "setup" && (
        <section className="setup">
          <div>
            <h2>Add Item</h2>
            <label>
              item
              <input
                value={manual.item}
                onChange={(event) =>
                  setManual({ ...manual, item: event.target.value })
                }
              />
            </label>
            <label>
              location
              <input
                value={manual.location}
                onChange={(event) =>
                  setManual({ ...manual, location: event.target.value })
                }
              />
            </label>
            <label>
              detail
              <textarea
                value={manual.detail}
                onChange={(event) =>
                  setManual({ ...manual, detail: event.target.value })
                }
              />
            </label>
            <label>
              startTime
              <input
                value={manual.startTime}
                onChange={(event) =>
                  setManual({ ...manual, startTime: event.target.value })
                }
              />
            </label>
            <label>
              duration
              <input
                value={manual.duration}
                onChange={(event) =>
                  setManual({ ...manual, duration: event.target.value })
                }
              />
            </label>
            <label>
              day
              <select
                value={manual.day}
                onChange={(event) =>
                  setManual({ ...manual, day: event.target.value })
                }
              >
                {DAYS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              assignment
              <select
                value={manual.assignment}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    assignment: event.target.value,
                    color:
                      event.target.value === "Agenda"
                        ? DEFAULT_AGENDA_COLOR
                        : manual.color,
                  })
                }
              >
                {["Input Bin", "Agenda", ...lanes].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              color
              <ColorPalette
                value={manual.color}
                onChange={(color) => setManual({ ...manual, color })}
              />
            </label>
            <button
              onClick={async () => {
                const created = makeTask(manual);
                if (created.item) {
                  await save([...tasks, created]);
                  setManual(blank(day));
                }
              }}
            >
              Add
            </button>
          </div>

          <div>
            <h2>Paste Excel</h2>
            <p>
              Item, Location, Detail, Start Time, Duration, Day, Assignment,
              Color
            </p>
            <textarea
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
            />
            <button
              onClick={async () => {
                const imported = paste
                  .split(/\r?\n/)
                  .filter(Boolean)
                  .map((row) => {
                    const cells = row.split("\t");
                    return makeTask({
                      item: cells[0] || "",
                      location: cells[1] || "",
                      detail: cells[2] || "",
                      startTime: cells[3] || "",
                      duration: cells[4] || "",
                      day: cells[5] || "Day 1",
                      assignment: cells[6] || "Input Bin",
                      color: cells[7] || "",
                    });
                  })
                  .filter((item) => item.item);
                setLanes((old) => [
                  ...new Set([
                    ...old,
                    ...imported
                      .flatMap((item) => item.assignments)
                      .filter(
                        (item) => !["Input Bin", "Agenda"].includes(item),
                      ),
                  ]),
                ]);
                await save([...tasks, ...imported]);
                setPaste("");
              }}
            >
              Import
            </button>
            <button onClick={exportTasks}>Export TSV</button>
            <button onClick={backupJson}>Backup JSON</button>
            <button onClick={() => replaceRestoreInput.current?.click()}>
              Restore Replace
            </button>
            <button onClick={() => mergeRestoreInput.current?.click()}>
              Restore Merge
            </button>
            <input
              ref={replaceRestoreInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                await restoreJson(event.target.files?.[0], "replace");
                event.target.value = "";
              }}
            />
            <input
              ref={mergeRestoreInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                await restoreJson(event.target.files?.[0], "merge");
                event.target.value = "";
              }}
            />
          </div>

          <div>
            <h2>Lanes</h2>
            {lanes.map((lane, index) => (
              <p key={index}>
                <input
                  value={lane}
                  onChange={(event) =>
                    setLanes(
                      lanes.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                />
                <button
                  onClick={() => {
                    captureUndo();
                    setLanes(lanes.filter((_, i) => i !== index));
                  }}
                >
                  Remove
                </button>
              </p>
            ))}
            <button
              onClick={() => {
                captureUndo();
                setLanes([...lanes, `Lane ${lanes.length + 1}`]);
              }}
            >
              Add Lane
            </button>
            <button
              className="danger"
              onClick={async () => {
                if (confirm("Clear all tasks and photos?")) {
                  captureUndo();
                  await clearAll();
                  setTasks([]);
                  setPhotos({});
                }
              }}
            >
              Clear Data
            </button>
          </div>
        </section>
      )}

      {edit && draft && (
        <aside className="drawer" onKeyDown={handleEditorKeyDown}>
          <button className="close" onClick={cancelEditor}>
            ×
          </button>
          <h2>Edit Item</h2>
          <label>
            item
            <input
              autoFocus
              value={draft.item}
              onChange={(event) =>
                setDraft({ ...draft, item: event.target.value })
              }
            />
          </label>
          <label>
            location
            <input
              value={draft.location}
              onChange={(event) =>
                setDraft({ ...draft, location: event.target.value })
              }
            />
          </label>
          <label>
            detail
            <textarea
              rows="6"
              value={draft.detail}
              onChange={(event) =>
                setDraft({ ...draft, detail: event.target.value })
              }
            />
          </label>
          <label>
            startTime
            <input
              value={draft.startTime}
              onChange={(event) =>
                setDraft({ ...draft, startTime: event.target.value })
              }
            />
          </label>
          <label>
            duration
            <input
              value={draft.duration}
              onChange={(event) =>
                setDraft({ ...draft, duration: event.target.value })
              }
            />
          </label>
          <label>
            Day
            <select
              value={draft.day}
              onChange={(event) =>
                setDraft({ ...draft, day: event.target.value })
              }
            >
              {DAYS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Color
            <ColorPalette
              value={draft.color || DEFAULT_TASK_COLOR}
              onChange={(color) => setDraft({ ...draft, color })}
            />
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  color: draft.assignments.includes("Agenda")
                    ? DEFAULT_AGENDA_COLOR
                    : DEFAULT_TASK_COLOR,
                })
              }
            >
              Reset color
            </button>
          </label>
          <fieldset>
            <legend>Assignments</legend>
            {["Input Bin", "Agenda", ...lanes].map((lane) => (
              <label className="tick" key={lane}>
                <input
                  type="checkbox"
                  checked={draft.assignments.includes(lane)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      assignments: event.target.checked
                        ? [...new Set([...draft.assignments, lane])]
                        : draft.assignments.filter((value) => value !== lane),
                    })
                  }
                />
                {lane}
              </label>
            ))}
          </fieldset>
          <label className="tick">
            <input
              type="checkbox"
              checked={draft.completed}
              onChange={(event) =>
                setDraft({ ...draft, completed: event.target.checked })
              }
            />
            Complete
          </label>
          <div className="photoEditor">
            <b>Agenda photos</b>
            <p>Drag one or more pictures onto the Agenda card.</p>
            <label className="file">
              Add photos
              <input
                multiple
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  await addPhotos(edit, event.target.files);
                  await refreshPhotos(edit);
                }}
              />
            </label>
            <div className="thumbs">
              {(photos[edit] || []).map((photo, index) => (
                <div key={photo.id}>
                  <img
                    src={photo.url}
                    onClick={() => {
                      setGallery(edit);
                      setGalleryIndex(index);
                    }}
                  />
                  <button
                    onClick={async () => {
                      await removePhoto(photo.id);
                      await refreshPhotos(edit);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button className="save" onClick={saveEditor}>
            Save
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (
                confirm(
                  "Delete item? Photos on this item will also be deleted.",
                )
              ) {
                captureUndo();
                await deleteTask(edit);
                setTasks(tasks.filter((item) => item.id !== edit));
                cancelEditor();
              }
            }}
          >
            Delete
          </button>
          <p className="keyboardHint">
            Enter saves. Escape cancels. In Detail, Enter adds a line and
            Ctrl+Enter saves.
          </p>
        </aside>
      )}

      {gallery && photos[gallery]?.length > 0 && (
        <div className="lightbox" onClick={() => setGallery(null)}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setGalleryIndex(
                (galleryIndex - 1 + photos[gallery].length) %
                  photos[gallery].length,
              );
            }}
          >
            ‹
          </button>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={photos[gallery][galleryIndex].url} />
            <figcaption>
              {galleryIndex + 1} of {photos[gallery].length}
            </figcaption>
          </figure>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setGalleryIndex((galleryIndex + 1) % photos[gallery].length);
            }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
