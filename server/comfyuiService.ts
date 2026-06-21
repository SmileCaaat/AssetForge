import sharp from "sharp";

const COMFYUI = "http://127.0.0.1:8188";

export async function checkComfyUI(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFYUI}/system_stats`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadImageToComfyUI(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer)], { type: "image/png" }), filename);
  const res = await fetch(`${COMFYUI}/upload/image`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`ComfyUI 上传失败: ${res.status} ${res.statusText}`);
  const data = await res.json() as { name: string };
  return data.name;
}

export interface Img2ImgOpts {
  imageName: string;
  prompt: string;
  negPrompt: string;
  denoise?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
  checkpoint?: string;
}

function buildImg2ImgWorkflow(opts: Required<Img2ImgOpts>): object {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: opts.checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: opts.prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: opts.negPrompt, clip: ["1", 1] } },
    // LoadImage: just the filename, no 'upload' field (that's a UI-only widget hint)
    "4": { class_type: "LoadImage", inputs: { image: opts.imageName } },
    // VAEEncode directly from LoadImage — image is pre-resized server-side via Sharp
    "5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["5", 0],
        seed: opts.seed, steps: opts.steps, cfg: opts.cfg,
        sampler_name: "euler", scheduler: "normal", denoise: opts.denoise,
      },
    },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "assetforge_ai" } },
  };
}

interface HistoryEntry {
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
}

async function pollHistory(promptId: string): Promise<{ filename: string; subfolder: string; type: string }> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 1200));
    try {
      const res = await fetch(`${COMFYUI}/history/${promptId}`);
      if (!res.ok) continue;
      const hist = await res.json() as Record<string, HistoryEntry>;
      const entry = hist[promptId];
      if (!entry?.outputs) continue;
      for (const node of Object.values(entry.outputs)) {
        if (node.images?.[0]) return node.images[0];
      }
    } catch {
      // retry
    }
  }
  throw new Error("ComfyUI 超时（超过 5 分钟未返回结果）");
}

export async function runImg2Img(opts: Img2ImgOpts): Promise<Buffer> {
  // Use ?? so that explicit `undefined` from the client never overrides defaults.
  const full: Required<Img2ImgOpts> = {
    imageName: opts.imageName,
    prompt: opts.prompt,
    negPrompt: opts.negPrompt,
    denoise: opts.denoise ?? 0.5,
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 32),
    steps: opts.steps ?? 20,
    cfg: opts.cfg ?? 7.0,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    checkpoint: opts.checkpoint ?? "animagine-xl-4.0-opt.safetensors",
  };

  const workflow = buildImg2ImgWorkflow(full);
  const clientId = crypto.randomUUID();

  const queueRes = await fetch(`${COMFYUI}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!queueRes.ok) {
    const body = await queueRes.text();
    throw new Error(`ComfyUI 提交失败: ${queueRes.status} — ${body.slice(0, 400)}`);
  }
  const queued = await queueRes.json() as { prompt_id: string };

  const imgInfo = await pollHistory(queued.prompt_id);
  const params = new URLSearchParams({ filename: imgInfo.filename, type: imgInfo.type, subfolder: imgInfo.subfolder || "" });
  const viewRes = await fetch(`${COMFYUI}/view?${params}`);
  if (!viewRes.ok) throw new Error(`ComfyUI 取图失败: ${viewRes.status}`);

  return Buffer.from(await viewRes.arrayBuffer());
}

// Pre-process image before uploading to ComfyUI:
// resize to target dimensions and strip alpha (white background) so VAEEncode gets clean input.
export async function prepareImageForComfyUI(
  buffer: Buffer,
  width = 1024,
  height = 1024,
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer() as Promise<Buffer>;
}
