import { promisify } from 'util';
import childProcess from 'child_process';

import { Release } from './helm.types';

const exec = promisify(childProcess.exec);

/**
 * A wrapper around the built-in exec that will throw an exception if anything
 * is printed to stderr
 * @param command command to execute
 */
export const runCommand = async (command: string) => {
    const { stdout, stderr } = await exec(command);
    if (stderr) {
        throw new Error(stderr);
    }
    return stdout;
};

export interface SingleStringValue {
  value: string;
  type: 'single'
};

export interface MultiStringValue {
  value: string[]
  type: 'multi'
}

/**
 * This command installs a chart archive. https://helm.sh/docs/helm/helm_install/#helm-install
 *
 * @param name name of the chart to install
 * @param chart a path to a packaged chart, a path to an unpacked chart
 * directory, or a URL.
 * @param variables A dictionary of key value strings to pass as value overrides
 * in the helm chart
 */
export async function install(name: string, chart: string, kubeConfigFile: string, variables: { [key: string]: SingleStringValue | MultiStringValue }, timeout: string = '10m0s'): Promise<Release> {
    let helmVariableString = '';
    for (const [key, values] of Object.entries(variables)) {
        if(values.type === 'single') {
            helmVariableString += ` --set "${key}=${values.value}"`;
        } else if(values.type === 'multi') {
            helmVariableString += ` --set "${key}=\{${values.value.join(',')}\}"`;
        } else {
            new Error('Unhandled variables type in helm install');
        }
    }
    const installCommand = `helm --kubeconfig=${kubeConfigFile} install ${name} ${chart} ${helmVariableString} -o json --timeout ${timeout}`;

    const stdout = await runCommand(installCommand);
    return JSON.parse(stdout);
};

/**
 * Adds a helm repo. https://helm.sh/docs/helm/helm_repo_add/
 * @param name The name of the repo to add
 * @param url The url of the helm repo
 * @returns
 */
export async function addRepo(name: string, url: string): Promise<string> {
    const addRepoCommand = `helm repo add ${name} ${url} --force-update`;
    return runCommand(addRepoCommand);
};