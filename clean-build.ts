const { exit } = require("process");
const fs = require('fs');
import { LINUX_DAEMON_PATH, MACOS_DAEMON_PATH, WINDOWS_DAEMON_PATH } from './src/utils/daemon-utils'

// Helper script to clean up the binaries based on the OS so we 
// do not package all binaries with every zli release
enum ZliBinaryType {
    MacOs = 'macos',
    Linux = 'linux',
    Windows = 'windows'
}

if (process.platform === 'win32') {
    console.log('Deleting all but windows binaries');
    deleteBinary(ZliBinaryType.Linux);
    deleteBinary(ZliBinaryType.MacOs);
} else if (process.platform === 'linux') {
    console.log('Deleting all but linux binaries');
    deleteBinary(ZliBinaryType.Windows);
    deleteBinary(ZliBinaryType.MacOs);
} else if (process.platform === 'darwin') {
    console.log('Deleting all but macos binaries');
    deleteBinary(ZliBinaryType.Windows);
    deleteBinary(ZliBinaryType.Linux);
} else {
    console.log('Unsupported OS!');
    exit(1);
}

// Helper function to delete a type of binary
function deleteBinary(binaryType: ZliBinaryType) {
    if (binaryType == ZliBinaryType.MacOs) {
        // Delete the mac binary
        fs.unlinkSync(MACOS_DAEMON_PATH);
    } else if (binaryType == ZliBinaryType.Linux) {
        // Delete the linux binary
        fs.unlinkSync(LINUX_DAEMON_PATH);
    } else if (binaryType == ZliBinaryType.Windows) {
        // Delete the window binary
        fs.unlinkSync(WINDOWS_DAEMON_PATH);
    } else {
        console.log(`Unhandled binary type passed to delete binary: ${binaryType}`)
        exit(1)
    }
}