import fs from "fs/promises";
import path from "path";
import chalk from "chalk-template";
import {fixFormat} from "./generate-src.js";

const CONVERTED = new URL("../converted/", import.meta.url);

const files = await fs.readdir(CONVERTED);
for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filepath = new URL(file, CONVERTED);
    const content = JSON.parse(await fs.readFile(filepath, "utf8"));
    fixFormat("structuredjson", content, { ignoreEmpty: true });
    await fs.writeFile(filepath, JSON.stringify(content, undefined, 2), "utf8");
    console.log(chalk`{gray NOTE}: Processed: ${path.basename(file)}`);
}
