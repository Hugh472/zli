import { CliArgParser } from "./arg-parser";
import got from 'got';
import chalk from 'chalk';
import figlet from "figlet";
import { HttpService } from "./http.service";

// console.log('1 cup cloves garlic, 2 teaspoons salt, 1/4 cup lemon juice, 1/4 cup water, 3 cups neutral oil');

console.log(
    chalk.magentaBright(
      figlet.textSync('clunk80 cli', { horizontalLayout: 'full' })
    )
  );


// TODO: remove, only using to test got lib
interface MixpanelTokenResponse
{
    token: string;
}

const run = async () => {
    
    var parser = new CliArgParser();
    var args = parser.parseArgs();

    var httpService = new HttpService(args.jwt);

    const cool = await httpService.Get<MixpanelTokenResponse>('api/v1/mixpanel/token', null);

    console.log(cool); // only prints raw json, need to parse this
};

run();