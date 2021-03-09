from sshconf import read_ssh_config
from botocore.exceptions import ClientError

import time
from shutil import copyfile


REGION = 'us-east-1'

IMAGE_ID_MAPPER = {
    'AWS Linux 2': {
        'imageId': 'ami-0915bcb5fa77e4892',
        'sshUser': 'ec2-user',
    },
}

class bcolors:
    # Ref: https://stackoverflow.com/questions/287871/how-to-print-colored-text-to-the-terminal
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def watchInstanceStart(ec2, instanceName, instanceId, ssh_config_path, ssh_key_path, ssh_host_name, imageKey=None):
    # Grab the instance status and keep polling
    instanceStatus = ''
    while instanceStatus != 'running':
        try:
            instanceStatus = ec2.Instance(instanceId).state['Name']
            print(f'{bcolors.OKBLUE}Current Instance State:{bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN} {instanceStatus}{bcolors.ENDC}')
        except ClientError:
            # The instance needs a minute to start up, might get an instance not found error 
            pass
        finally:
            if instanceStatus == 'running':
                break
            else:
                time.sleep(10)
    
    # Alert the user of info regarding the instance
    instance = ec2.Instance(instanceId)
    print(f'\n{bcolors.BOLD}{bcolors.OKBLUE}Instance has started!{bcolors.ENDC} \n \
    {bcolors.OKBLUE}Instance Information:{bcolors.ENDC} \
    \n\t{bcolors.OKBLUE}* Public IP: {bcolors.ENDC}{bcolors.OKGREEN}{instance.public_ip_address}{bcolors.ENDC} ')
    
    sshConfigUpdateBool = input(f'{bcolors.OKBLUE}(Optional) Press 1 to add an entry for {instanceName} in your {ssh_config_path}{bcolors.ENDC}\n')
    
    if sshConfigUpdateBool == '1':
        if ssh_config_path is None or ssh_key_path is None:
            print(f'{bcolors.FAIL}Cannot update ssh config file if no path is passed: {ssh_config_path}. Or no key path is passed: {ssh_key_path}{bcolors.ENDC}')
        else:
            # First make a backup of our file
            copyfile(ssh_config_path, f'{ssh_config_path}-backup')

            # Now update the config information
            sshConfigFile = read_ssh_config(ssh_config_path)

            hostName = ssh_host_name if ssh_host_name else instanceName

            # Check if the instance already exists
            if sshConfigFile.host(hostName):
                # Ask the user if they want to overwrite
                overwriteSshBool = input(f'{bcolors.WARNING}Found entry: {sshConfigFile.host(hostName)} in {ssh_config_path}. Press 1 to overwrite: {bcolors.ENDC}\n')

                if overwriteSshBool == '1':
                    # Then just update the key and hostname
                    sshConfigFile.set(hostName, Hostname=instance.public_ip_address, IdentityFile=ssh_key_path)

                print(f'{bcolors.BOLD}{bcolors.OKBLUE}Updated entry for {hostName} in {ssh_config_path}!{bcolors.ENDC}\n')
            else:
                # Add our new instance
                sshConfigFile.add(hostName, Hostname=instance.public_ip_address, Port=22, IdentityFile=ssh_key_path, PubkeyAuthentication='yes')

                if imageKey:
                    sshConfigFile.set(hostName, User=IMAGE_ID_MAPPER[imageKey]['sshUser'])

                print(f'{bcolors.BOLD}{bcolors.OKBLUE}Added entry for {hostName} in {ssh_config_path}!{bcolors.ENDC}\n')
            
            # Save our updated file
            sshConfigFile.save()