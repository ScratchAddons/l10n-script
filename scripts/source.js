import fs from "fs/promises";
import chalk from "chalk-template";
import generateSrc from "./generate-src.js";

const messages = await generateSrc();
await fs.writeFile("addons-source.json", JSON.stringify(messages, undefined, 2), "utf8");
console.log(chalk`{gray NOTE}: English source file generated: addons-source.json`);
