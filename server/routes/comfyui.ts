import { Router } from "express";
import { checkComfyUI, uploadImageToComfyUI, runImg2Img, prepareImageForComfyUI } from "../comfyuiService.js";

export const comfyuiRouter = Router();

comfyuiRouter.get("/status", async (_req, res) => {
  const running = await checkComfyUI();
  res.json({ running });
});

comfyuiRouter.post("/refine", async (req, res) => {
  try {
    const { imageBase64, prompt, negPrompt, denoise, seed, steps, cfg, width, height, checkpoint } = req.body as {
      imageBase64: string;
      prompt: string;
      negPrompt: string;
      denoise?: number;
      seed?: number;
      steps?: number;
      cfg?: number;
      width?: number;
      height?: number;
      checkpoint?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");
    // Resize to 1024×1024 and flatten alpha → white before sending to ComfyUI.
    const buffer = await prepareImageForComfyUI(rawBuffer, width ?? 1024, height ?? 1024);
    const filename = `assetforge_in_${Date.now()}.png`;

    const imageName = await uploadImageToComfyUI(buffer, filename);
    const resultBuffer = await runImg2Img({
      imageName,
      prompt: prompt || "1girl, anime style, high quality, detailed texture",
      negPrompt: negPrompt || "blurry, low quality, deformed, nsfw, watermark",
      denoise: denoise ?? 0.5,
      seed,
      steps,
      cfg,
      width,
      height,
      checkpoint,
    });

    const resultBase64 = `data:image/png;base64,${resultBuffer.toString("base64")}`;
    res.json({ imageBase64: resultBase64 });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
