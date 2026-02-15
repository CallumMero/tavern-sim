const SCENE_WIDTH = 320;
const SCENE_HEIGHT = 180;
const GUEST_SLOT_COUNT = 16;
const SPRITE_ALPHA_THRESHOLD = 104;

const CHARACTER_ASSET_FILES = {
  adventurer_mele: "adventurer (mele).png",
  adventurer_rogue: "adventurer (rogue).png",
  bard: "bard.png",
  barman: "barman.png",
  blacksmith: "blacksmith.png",
  cook: "cook.png",
  guard: "guard.png",
  royal_inspector: "guild inspector.png",
  herbologist: "herbologist.png",
  merchant: "merchant.png",
  regular: "regular.png",
  server: "server.png",
  server_walking: "server_walking.png"
};

const CHARACTER_SPRITE_HINTS = {
  adventurer_mele: { mode: "duo" },
  adventurer_rogue: { mode: "duo" },
  bard: { mode: "duo" },
  barman: { mode: "duo" },
  blacksmith: { mode: "duo" },
  cook: { mode: "duo" },
  guard: { mode: "duo" },
  royal_inspector: { mode: "duo" },
  herbologist: { mode: "duo" },
  merchant: { mode: "duo" },
  regular: { mode: "duo" },
  server: { mode: "duo" },
  server_walking: {
    mode: "grid",
    cols: 3,
    rows: 3
  }
};

const STAFF_SPRITE_PREFS = {
  barkeep: ["barman"],
  cook: ["cook"],
  server: ["server_walking", "server"],
  guard: ["guard"]
};

const COHORT_SPRITE_PREFS = {
  locals: ["regular"],
  adventurers: ["adventurer_mele", "adventurer_rogue"],
  merchants: ["merchant"],
  nobles: ["royal_inspector", "merchant"]
};

const CAMEO_SPRITES = ["bard", "blacksmith", "herbologist"];

const STAFF_ROLE_PALETTES = {
  barkeep: {
    outfit: ["#7d4e2e", "#6f4529", "#8f5b35"],
    trim: ["#d0a15a", "#c48e46"],
    hair: ["#4e2e1f", "#734a2f", "#2f1f17"]
  },
  cook: {
    outfit: ["#d5c5a8", "#c8b792", "#e0d1b6"],
    trim: ["#8d6c4e", "#795a41"],
    hair: ["#47332a", "#5f4537", "#2a1d17"]
  },
  server: {
    outfit: ["#6f5a35", "#604d2f", "#7f6940"],
    trim: ["#d6b47a", "#c59f62"],
    hair: ["#54362a", "#7a5139", "#2f211a"]
  },
  guard: {
    outfit: ["#5a4f40", "#4c4235", "#6a5d4a"],
    trim: ["#b59c72", "#a18862"],
    hair: ["#2f2f3f", "#47495f", "#1e2030"]
  }
};

const COHORT_PALETTES = {
  locals: {
    outfit: ["#6d5736", "#5b482d", "#7d6641"],
    trim: ["#d1b178", "#c39d65"],
    hair: ["#4e372a", "#634734", "#2d1f17"]
  },
  adventurers: {
    outfit: ["#6f4d35", "#5f412d", "#835a3d"],
    trim: ["#dbc48a", "#c9ad6f"],
    hair: ["#3d2e24", "#553f30", "#221913"]
  },
  merchants: {
    outfit: ["#6e4434", "#5d392d", "#7c4f3c"],
    trim: ["#dfc38f", "#d1b078"],
    hair: ["#553a2f", "#6e4b3b", "#2f221a"]
  },
  nobles: {
    outfit: ["#7f4333", "#70392b", "#93503d"],
    trim: ["#ecd3a0", "#dcbf87"],
    hair: ["#3d2d2d", "#5a4141", "#241b1b"]
  }
};

const SKIN_TONES = ["#f4d2b9", "#e8bf98", "#d8a67d", "#c28d69"];
const BOOT_COLORS = ["#32231b", "#402b1f", "#2b1e17"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(text) {
  const input = String(text);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickFrom(list, seed, salt) {
  const index = hashString(`${seed}:${salt}`) % list.length;
  return list[index];
}

function mixColor(a, b, alpha) {
  const parse = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  });
  const c1 = parse(a);
  const c2 = parse(b);
  const blend = (v1, v2) => Math.round(v1 + (v2 - v1) * alpha);
  const out = {
    r: blend(c1.r, c2.r),
    g: blend(c1.g, c2.g),
    b: blend(c1.b, c2.b)
  };
  return `rgb(${out.r}, ${out.g}, ${out.b})`;
}

function assetUrl(fileName) {
  return new URL(`../../assets/${fileName}`, import.meta.url).href;
}

function buildDuoFrames(width, height) {
  const halfWidth = width / 2;
  const frames = [];
  for (let i = 0; i < 2; i += 1) {
    const cellLeft = i * halfWidth;
    const frame = {
      sx: cellLeft + halfWidth * 0.18,
      sy: height * 0.1,
      sw: halfWidth * 0.64,
      sh: height * 0.76
    };
    frames.push(frame);
  }
  return frames;
}

function buildGridFrames(width, height, cols, rows) {
  const frames = [];
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      frames.push({
        sx: col * cellWidth + cellWidth * 0.2,
        sy: row * cellHeight + cellHeight * 0.14,
        sw: cellWidth * 0.6,
        sh: cellHeight * 0.74
      });
    }
  }
  return frames;
}

function getOpaquePixelCount(data, imageWidth, rect, alphaThreshold) {
  let count = 0;
  const left = Math.max(0, Math.floor(rect.sx));
  const top = Math.max(0, Math.floor(rect.sy));
  const right = Math.min(imageWidth, Math.floor(rect.sx + rect.sw));
  const bottom = Math.floor(rect.sy + rect.sh);
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const alpha = data[(y * imageWidth + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        count += 1;
      }
    }
  }
  return count;
}

function extractFrames(image, hint) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const mode = hint && hint.mode ? hint.mode : "duo";
  const candidates = mode === "grid"
    ? buildGridFrames(width, height, hint.cols || 3, hint.rows || 3)
    : buildDuoFrames(width, height);

  const probe = document.createElement("canvas");
  probe.width = width;
  probe.height = height;
  const probeCtx = probe.getContext("2d");
  if (!probeCtx) {
    return candidates;
  }
  probeCtx.drawImage(image, 0, 0);
  const imageData = probeCtx.getImageData(0, 0, width, height);
  const validFrames = candidates.filter((frame) => {
    const opaqueCount = getOpaquePixelCount(
      imageData.data,
      width,
      frame,
      SPRITE_ALPHA_THRESHOLD
    );
    return opaqueCount >= 40;
  });

  if (validFrames.length > 0) {
    return validFrames;
  }
  return candidates;
}

function normalizeFrame(frame, image) {
  const maxWidth = image.naturalWidth || image.width;
  const maxHeight = image.naturalHeight || image.height;
  const sx = clamp(frame.sx, 0, maxWidth - 1);
  const sy = clamp(frame.sy, 0, maxHeight - 1);
  const sw = clamp(frame.sw, 1, maxWidth - sx);
  const sh = clamp(frame.sh, 1, maxHeight - sy);
  return { sx, sy, sw, sh };
}

function createSpriteLibrary() {
  const assets = {};
  let hasLoaded = false;
  let loadPromise = null;

  function loadAll(onLoaded) {
    if (loadPromise) {
      return loadPromise;
    }
    const jobs = Object.entries(CHARACTER_ASSET_FILES).map(([key, fileName]) => {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          const hint = CHARACTER_SPRITE_HINTS[key];
          const frames = extractFrames(image, hint).map((frame) => normalizeFrame(frame, image));
          assets[key] = {
            image,
            frames
          };
          resolve();
        };
        image.onerror = () => {
          resolve();
        };
        image.src = assetUrl(fileName);
      });
    });

    loadPromise = Promise.all(jobs).then(() => {
      hasLoaded = true;
      if (typeof onLoaded === "function") {
        onLoaded();
      }
    });
    return loadPromise;
  }

  function getAnimatedFrame(key, time, seed, mode = "idle") {
    const entry = assets[key];
    if (!entry || !Array.isArray(entry.frames) || entry.frames.length === 0) {
      return null;
    }

    const sequence =
      mode === "walk" && entry.frames.length > 2
        ? entry.frames
        : entry.frames.slice(0, Math.min(2, entry.frames.length));
    if (sequence.length === 0) {
      return null;
    }

    const baseIndex = hashString(`${key}:${seed}`) % sequence.length;
    const cadence = mode === "walk" ? 150 : 290;
    const animatedIndex = Math.floor(time / cadence + baseIndex) % sequence.length;
    return {
      image: entry.image,
      frame: sequence[animatedIndex]
    };
  }

  return {
    loadAll,
    getAnimatedFrame,
    isReady: () => hasLoaded
  };
}

function resolveSpriteKeyByList(seed, candidateKeys) {
  if (!Array.isArray(candidateKeys) || candidateKeys.length === 0) {
    return null;
  }
  const index = hashString(seed) % candidateKeys.length;
  return candidateKeys[index];
}

function resolveCharacterPalette(seed, sourcePalette) {
  const safePalette = sourcePalette || COHORT_PALETTES.locals;
  return {
    outfit: pickFrom(safePalette.outfit, seed, "outfit"),
    trim: pickFrom(safePalette.trim, seed, "trim"),
    hair: pickFrom(safePalette.hair, seed, "hair"),
    skin: pickFrom(SKIN_TONES, seed, "skin"),
    boots: pickFrom(BOOT_COLORS, seed, "boots"),
    shadow: "rgba(0, 0, 0, 0.35)",
    eye: "#141116"
  };
}

function getStaffSlot(role, roleIndex) {
  const slots = {
    barkeep: [
      { x: 150, y: 53 },
      { x: 168, y: 53 },
      { x: 186, y: 53 }
    ],
    cook: [
      { x: 252, y: 60 },
      { x: 232, y: 60 },
      { x: 214, y: 60 }
    ],
    server: [
      { x: 126, y: 104 },
      { x: 164, y: 112 },
      { x: 196, y: 102 },
      { x: 220, y: 118 },
      { x: 146, y: 128 }
    ],
    guard: [
      { x: 30, y: 122 },
      { x: 48, y: 122 },
      { x: 66, y: 122 }
    ]
  };

  const roleSlots = slots[role] || [];
  if (roleIndex < roleSlots.length) {
    return roleSlots[roleIndex];
  }

  const overflowIndex = roleIndex - roleSlots.length;
  return {
    x: 84 + (overflowIndex % 7) * 18,
    y: 126 + Math.floor(overflowIndex / 7) * 12
  };
}

function drawRect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

function drawCharacter(ctx, args) {
  const {
    x,
    y,
    time,
    seed,
    palette,
    mood = 50,
    unavailable = false,
    spriteFrame = null,
    scale = 1
  } = args;

  const phase = (hashString(seed) % 1000) / 70;
  const bob = Math.sin(time / 220 + phase) * 0.9;
  const px = Math.round(x);
  const py = Math.round(y + bob);

  if (spriteFrame && spriteFrame.image && spriteFrame.frame) {
    const spriteWidth = Math.round(16 * scale);
    const spriteHeight = Math.round(22 * scale);
    const left = px + Math.round((16 - spriteWidth) / 2);
    const top = py + Math.round(14 - spriteHeight);
    drawRect(ctx, "rgba(0, 0, 0, 0.33)", px + 3, py + 14, 10, 2);
    const frame = spriteFrame.frame;
    ctx.drawImage(
      spriteFrame.image,
      Math.floor(frame.sx),
      Math.floor(frame.sy),
      Math.floor(frame.sw),
      Math.floor(frame.sh),
      left,
      top,
      spriteWidth,
      spriteHeight
    );
    if (unavailable) {
      drawRect(ctx, "#cf6a6a", px + 2, py + 0, 12, 1);
      drawRect(ctx, "#cf6a6a", px + 7, py - 2, 1, 5);
    }
    return;
  }

  drawRect(ctx, palette.shadow, px + 3, py + 14, 10, 2);
  drawRect(ctx, palette.boots, px + 4, py + 12, 3, 2);
  drawRect(ctx, palette.boots, px + 9, py + 12, 3, 2);

  const outfitBase = mood < 42 ? mixColor(palette.outfit, "#3a3a3a", 0.25) : palette.outfit;
  drawRect(ctx, outfitBase, px + 4, py + 6, 8, 6);
  drawRect(ctx, palette.trim, px + 4, py + 8, 8, 1);
  drawRect(ctx, palette.skin, px + 5, py + 2, 6, 4);
  drawRect(ctx, palette.hair, px + 5, py + 1, 6, 2);
  drawRect(ctx, palette.eye, px + 6, py + 4, 1, 1);
  drawRect(ctx, palette.eye, px + 9, py + 4, 1, 1);

  if (unavailable) {
    drawRect(ctx, "#cf6a6a", px + 2, py + 0, 12, 1);
    drawRect(ctx, "#cf6a6a", px + 7, py - 2, 1, 5);
  }
}

function drawBackdrop(ctx, state, time) {
  drawRect(ctx, "#1a1009", 0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  drawRect(ctx, "#2b1a0f", 0, 0, SCENE_WIDTH, 52);
  drawRect(ctx, "#3b2413", 0, 52, SCENE_WIDTH, 20);
  drawRect(ctx, "#4d2e19", 0, 72, SCENE_WIDTH, SCENE_HEIGHT - 72);

  for (let beamX = 0; beamX < SCENE_WIDTH; beamX += 42) {
    drawRect(ctx, "#25160c", beamX, 0, 10, 72);
    drawRect(ctx, "#4b2e19", beamX + 3, 0, 1, 72);
  }

  for (let beamY = 10; beamY < 64; beamY += 18) {
    drawRect(ctx, "#26160d", 0, beamY, SCENE_WIDTH, 5);
    drawRect(ctx, "#422613", 0, beamY + 1, SCENE_WIDTH, 1);
  }

  for (let y = 72; y < SCENE_HEIGHT; y += 16) {
    for (let x = 0; x < SCENE_WIDTH; x += 16) {
      const tile = ((x / 16 + y / 16) % 2 === 0) ? "#5a351d" : "#633b20";
      drawRect(ctx, tile, x, y, 16, 16);
      drawRect(ctx, "#402413", x + 7, y, 1, 16);
    }
  }

  drawRect(ctx, "#6a4024", 0, 58, 228, 14);
  drawRect(ctx, "#8e5b36", 0, 58, 228, 3);
  drawRect(ctx, "#55321d", 238, 52, 82, 20);
  drawRect(ctx, "#5a351f", 24, 104, 28, 56);
  drawRect(ctx, "#2a170e", 26, 106, 24, 52);

  const firePulse = 0.45 + Math.sin(time / 180) * 0.2;
  drawRect(ctx, mixColor("#ffce79", "#ff7f28", firePulse), 286, 58, 9, 11);
  drawRect(ctx, "#493329", 280, 52, 22, 20);

  drawRect(ctx, mixColor("#ffdf9c", "#ff9c42", firePulse), 72, 21, 6, 8);
  drawRect(ctx, "#4d3628", 70, 18, 10, 12);
  drawRect(ctx, mixColor("#ffdf9c", "#ff9c42", firePulse), 154, 17, 6, 8);
  drawRect(ctx, "#4d3628", 152, 14, 10, 12);
  drawRect(ctx, mixColor("#ffdf9c", "#ff9c42", firePulse), 236, 22, 6, 8);
  drawRect(ctx, "#4d3628", 234, 19, 10, 12);

  const lanternGlow = (x, y, radius, alpha) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 199, 120, ${alpha})`);
    glow.addColorStop(1, "rgba(255, 140, 60, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  lanternGlow(75, 24, 38, 0.22 + firePulse * 0.14);
  lanternGlow(157, 20, 42, 0.2 + firePulse * 0.16);
  lanternGlow(239, 25, 36, 0.2 + firePulse * 0.12);
  lanternGlow(289, 64, 44, 0.24 + firePulse * 0.18);

  const tableSlots = [
    { x: 88, y: 108 },
    { x: 138, y: 122 },
    { x: 196, y: 104 },
    { x: 244, y: 122 }
  ];
  tableSlots.forEach((slot) => {
    drawRect(ctx, "#774829", slot.x, slot.y, 26, 12);
    drawRect(ctx, "#99633b", slot.x, slot.y, 26, 2);
  });

  drawRect(ctx, "#603a23", 272, 108, 34, 42);
  drawRect(ctx, "#8b5a37", 272, 108, 34, 3);

  if (state.lastNet < 0) {
    drawRect(ctx, "#8f2f3a", 6, 6, 46, 12);
  } else {
    drawRect(ctx, "#5e6e37", 6, 6, 46, 12);
  }
}

function getVisiblePatrons(state) {
  if (!Array.isArray(state.patrons) || state.patrons.length === 0) {
    return [];
  }
  const desired = clamp(Math.floor(state.lastGuests / 6), 3, GUEST_SLOT_COUNT);
  const rng = randomFromSeed(hashString(`crowd:${state.day}:${state.lastGuests}`));
  const pool = state.patrons.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(rng() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[swapIndex];
    pool[swapIndex] = temp;
  }
  return pool.slice(0, desired);
}

function drawPatronCrowd(ctx, state, time, spriteLibrary) {
  const patrons = getVisiblePatrons(state);
  const guestSlots = [
    { x: 92, y: 92 }, { x: 110, y: 96 }, { x: 132, y: 96 }, { x: 152, y: 100 },
    { x: 174, y: 92 }, { x: 194, y: 96 }, { x: 214, y: 98 }, { x: 232, y: 92 },
    { x: 100, y: 116 }, { x: 124, y: 120 }, { x: 146, y: 126 }, { x: 170, y: 116 },
    { x: 196, y: 124 }, { x: 220, y: 118 }, { x: 244, y: 126 }, { x: 266, y: 118 }
  ];

  patrons.forEach((patron, index) => {
    const slot = guestSlots[index % guestSlots.length];
    const palette = resolveCharacterPalette(
      patron.id,
      COHORT_PALETTES[patron.cohort]
    );
    const spriteKey = resolveSpriteKeyByList(
      patron.id,
      COHORT_SPRITE_PREFS[patron.cohort]
    );
    const spriteFrame = spriteKey
      ? spriteLibrary.getAnimatedFrame(spriteKey, time, patron.id, "idle")
      : null;
    drawCharacter(ctx, {
      x: slot.x,
      y: slot.y,
      time,
      seed: patron.id,
      palette,
      mood: patron.loyalty,
      spriteFrame,
      scale: 1.02
    });
  });
}

function drawCameoCharacters(ctx, state, time, spriteLibrary) {
  const cameoSeed = `cameo:${state.day}`;
  const cameoKey = CAMEO_SPRITES[hashString(cameoSeed) % CAMEO_SPRITES.length];
  const cameoFrame = spriteLibrary.getAnimatedFrame(cameoKey, time, cameoSeed, "idle");
  if (!cameoFrame) {
    return;
  }
  drawCharacter(ctx, {
    x: 263,
    y: 90,
    time,
    seed: cameoSeed,
    palette: resolveCharacterPalette(cameoSeed, COHORT_PALETTES.adventurers),
    mood: 70,
    spriteFrame,
    scale: 1.1
  });
}

function drawStaff(ctx, state, time, spriteLibrary) {
  const roleCounts = {};
  state.staff.forEach((person) => {
    const roleCount = roleCounts[person.role] || 0;
    roleCounts[person.role] = roleCount + 1;

    const slot = getStaffSlot(person.role, roleCount);
    const palette = resolveCharacterPalette(
      person.id,
      STAFF_ROLE_PALETTES[person.role] || STAFF_ROLE_PALETTES.server
    );
    const spriteKey = resolveSpriteKeyByList(
      person.id,
      STAFF_SPRITE_PREFS[person.role]
    );
    const motionMode = person.role === "server" ? "walk" : "idle";
    const spriteFrame = spriteKey
      ? spriteLibrary.getAnimatedFrame(spriteKey, time, person.id, motionMode)
      : null;
    drawCharacter(ctx, {
      x: slot.x,
      y: slot.y,
      time,
      seed: person.id,
      palette,
      mood: person.morale,
      unavailable: person.injuryDays > 0 || person.disputeDays > 0,
      spriteFrame,
      scale: 1.08
    });
  });
}

function drawHud(ctx, state) {
  ctx.font = "8px monospace";
  ctx.fillStyle = "#f3dfba";
  ctx.fillText(`DAY ${state.day}`, 10, 14);
  ctx.fillText(`GOLD ${Math.round(state.gold)}g`, 10, 24);
  ctx.fillText(`REP ${state.reputation}`, 10, 34);
  ctx.fillText(`GUESTS ${state.lastGuests}`, 10, 44);

  ctx.fillStyle = "#2a170d";
  ctx.fillRect(6, 150, 308, 24);
  ctx.strokeStyle = "#7f5734";
  ctx.strokeRect(6, 150, 308, 24);

  const sentiment = state.lastReport && state.lastReport.highlight
    ? state.lastReport.highlight
    : "Welcome to the Crown quarter tavern.";

  ctx.fillStyle = "#f5e5c4";
  ctx.font = "7px monospace";
  const clipped = sentiment.length > 68 ? `${sentiment.slice(0, 68)}...` : sentiment;
  ctx.fillText(clipped, 12, 164);
}

function drawBootScreen(ctx) {
  drawRect(ctx, "#1d120a", 0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = "#f3dfba";
  ctx.font = "10px monospace";
  ctx.fillText("TAVERN SIM VISUAL LAYER", 58, 80);
  ctx.font = "8px monospace";
  ctx.fillText("Waiting for simulation state...", 82, 98);
}

export function createPixelRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    return {
      render: () => {},
      start: () => {},
      destroy: () => {}
    };
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return {
      render: () => {},
      start: () => {},
      destroy: () => {}
    };
  }

  canvas.width = SCENE_WIDTH;
  canvas.height = SCENE_HEIGHT;
  canvas.style.imageRendering = "pixelated";
  ctx.imageSmoothingEnabled = false;
  const spriteLibrary = createSpriteLibrary();

  let stateRef = null;
  let frameHandle = null;
  let running = false;
  let lastFrameTime = 0;

  function drawFrame(timestamp) {
    if (!stateRef) {
      drawBootScreen(ctx);
      return;
    }

    const resolvedTime = Number.isFinite(timestamp) ? timestamp : lastFrameTime;
    drawBackdrop(ctx, stateRef, resolvedTime);
    drawPatronCrowd(ctx, stateRef, resolvedTime, spriteLibrary);
    drawCameoCharacters(ctx, stateRef, resolvedTime, spriteLibrary);
    drawStaff(ctx, stateRef, resolvedTime, spriteLibrary);
    drawHud(ctx, stateRef);
  }

  function tick(timestamp) {
    lastFrameTime = timestamp;
    drawFrame(timestamp);
    if (running) {
      frameHandle = requestAnimationFrame(tick);
    }
  }

  spriteLibrary.loadAll(() => {
    if (running) {
      drawFrame(lastFrameTime);
    } else {
      drawFrame(0);
    }
  });

  return {
    render: (nextState) => {
      stateRef = nextState;
      if (!running) {
        drawFrame(0);
      }
    },
    start: () => {
      if (running) {
        return;
      }
      running = true;
      frameHandle = requestAnimationFrame(tick);
    },
    destroy: () => {
      running = false;
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
    }
  };
}
