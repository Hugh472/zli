import { CliArgParser } from "./arg-parser";
import got from "got";

console.log('1 cup cloves garlic, 2 teaspoons salt, 1/4 cup lemon juice, 1/4 cup water, 3 cups neutral oil');


var parser = new CliArgParser();

console.log(parser.parseArgs());

const run = async () => {
    const resp = await got("https://www.commonwealthcrypto.com/");
    console.log(resp.statusCode);
}

run();