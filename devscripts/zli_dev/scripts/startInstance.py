import boto3

import zli_dev.scripts.utils as utils
from zli_dev.scripts.utils import REGION, bcolors


def startInstanceHandler(instanceName, ssh_config_path, ssh_key_path, ssh_host_name):
    """
    Script to find and start Ec2 Instance
    """
    print(f'{bcolors.OKCYAN}Attemping to find EC2 instance with name: {instanceName}...{bcolors.ENDC}\n')

    # Create our boto client
    ec2Client = boto3.client('ec2', REGION)
    ec2 = boto3.resource('ec2')

    # Make our query
    instances = ec2Client.describe_instances(Filters=[{'Name':'tag:Name', 'Values':[instanceName]}])
    
    if len(instances['Reservations']) == 0:
        print(f'{bcolors.FAIL}Error. No instances with the \'Name\' tag: {instanceName} {bcolors.ENDC}')
        exit(1)
    if len(instances['Reservations']) == 1:
        # We can just return the top value
        instance = instances['Reservations'][0]['Instances'][0]
    else:
        # We have to show all the options
        index = 0
        instanceWithNameTag = []
        for instance in instances['Reservations']:
            for tagItem in instances['Reservations'][0]['Instances'][0]['Tags']:
                if tagItem['Key'] == 'Name':
                    print(f'{bcolors.BOLD}{bcolors.OKBLUE}[{index}]{bcolors.ENDC}{bcolors.OKGREEN} {tagItem["Value"]}{bcolors.ENDC}')
                    index += 1
                    instanceWithNameTag.append(instance)

        # Let them select which instance they want to use
        instanceIndex = input(f'\n{bcolors.OKCYAN}Please select an instance:{bcolors.ENDC} \n')
        instance = instanceWithNameTag[instanceIndex]['Instances'][0]

    instanceId = instance['InstanceId']    
    for tagItem in instance['Tags']:
        if tagItem['Key'] == 'Name':
            instanceName = tagItem['Value']
    

    print(f'{bcolors.BOLD}{bcolors.OKBLUE}Found instance: {(instanceName + " (" + instanceId + ")") if instanceName else instanceId}!{bcolors.ENDC}\n')

    # Check if the instance is already running
    if instance['State']['Name'] in ['running', 'stopping'] :
        print(f'{bcolors.FAIL}Error. Instance ({instanceId}) cannot be started from current state: {instance["State"]["Name"]}!{bcolors.ENDC}')
        exit(1)
    
    # Check if the user wants to start that instance
    startBool = input(f'{bcolors.OKCYAN}Press 1 to start instance {instanceName if instanceName else instanceId}\n')
    if startBool != '1':
        print(f'{bcolors.FAIL}Exiting. Not starting any instance.{bcolors.ENDC}')
        exit(0)
    print(f'\n{bcolors.OKBLUE}Attempting to start instance: {instanceName if instanceName else instanceId}...{bcolors.ENDC}\n')

    # Start the instance
    ec2Client.start_instances(
        InstanceIds=[
            instanceId
        ],
    )

    # Watch the instance start
    instanceNameArg = instanceName if instanceName else instanceId
    utils.watchInstanceStart(ec2, instanceNameArg, instanceId, ssh_config_path, ssh_key_path, ssh_host_name)