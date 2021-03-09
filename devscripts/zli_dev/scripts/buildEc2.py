import boto3
import pyperclip
import requests
import click

import os
from shutil import copyfile

import zli_dev.scripts.utils as utils
from zli_dev.scripts.utils import REGION, bcolors, IMAGE_ID_MAPPER

INSTANCE_TYPE = [
    't2.micro',
    't2.nano',
    't2.micro',
    't2.small',
    't2.medium',
    't2.large',
]

KEYPAIR = 'cwc-jan2020'


def buildEc2Handler(sec_group, ssh_config_path, ssh_key_path, ssh_host_name):
    """
    Interactive command to create EC2 Instance
    """
    ec2 = boto3.resource('ec2')

    # Determine what type of image they want to create (i.e. the OS)
    index = 0
    for image in IMAGE_ID_MAPPER.keys():
        print(f'{bcolors.BOLD}{bcolors.OKBLUE}[{index}]{bcolors.ENDC}{bcolors.OKGREEN} {image}{bcolors.ENDC}')
    imageIndex = input(f'\n{bcolors.OKCYAN}Please select an image: {bcolors.ENDC}\n')

    try:
        imageKey = list(IMAGE_ID_MAPPER)[int(imageIndex)]
    except Exception as err:
        print(f'{bcolors.FAIL}Invalid index passed: {imageIndex}. Error: {err}{bcolors.ENDC}')
        exit(1)

    print(f'\n{bcolors.OKBLUE}Selected Image {imageKey} ({IMAGE_ID_MAPPER[imageKey]["imageId"]}){bcolors.ENDC}\n')


    # Determine what type of instance they want (i.e. size)
    index = 0
    for singleInstanceType in INSTANCE_TYPE:
        print(f'{bcolors.BOLD}{bcolors.OKBLUE}[{index}]{bcolors.ENDC}{bcolors.OKGREEN} {singleInstanceType}{bcolors.ENDC}')
    instanceIndex = input(f'\n{bcolors.OKCYAN}Please select an instance type:{bcolors.ENDC} \n')

    try:
        instanceType = list(INSTANCE_TYPE)[int(instanceIndex)]
    except Exception as err:
        print(f'{bcolors.FAIL}Invalid index passed: {instanceIndex}. Error: {err}{bcolors.ENDC}')
        exit(1)

    print(f'\n{bcolors.OKBLUE}Selected Instance Type {instanceType}{bcolors.ENDC}\n')

    # Let the user know what we're creating
    print(f'{bcolors.BOLD}{bcolors.OKCYAN}Creating {imageKey} of type {instanceType}{bcolors.ENDC}')

    instanceName = input(f'\n{bcolors.OKCYAN}Please enter a name for your instance:{bcolors.ENDC} \n')
    if not instanceName:
        print(f'{bcolors.FAIL}Error you must select an instance name!{bcolors.ENDC}')
        exit(1)

    userDataBool = input(f'\n{bcolors.OKCYAN}(Optional) Press 1 to copy UserData from clipboard{bcolors.ENDC}\n')
    userData = ""
    if userDataBool == '1':
        userData = pyperclip.paste()

    inboundIpBool = input(f'\n{bcolors.OKCYAN}(Optional) Press 1 to automatically create a security group and add this computer as a inbound SSH rule (Name passed: {sec_group}){bcolors.ENDC}\n')
    print('')
    inboundIp = None
    if (inboundIpBool == '1' or sec_group):
        if inboundIpBool == '1':
            # Create a new sec group for our instance
            if not sec_group:
                # Throw an error if we don't specify a name
                print(f'{bcolors.FAIL}Error. You must specify a name (via --sec-group) when creating a new security group!{bcolors.ENDC}')
                exit(1)
            
            # Create a new security group
            securityGroup = ec2.create_security_group(
                GroupName=sec_group,
                Description='Security Group created via zli-dev.',
                TagSpecifications=[
                {
                    'ResourceType': 'security-group',
                    'Tags': [
                        {
                            'Key': 'Name',
                            'Value': sec_group
                        }
                    ]
                }
            ]
            )

            # Get our Ip address 
            inboundIp = requests.request('GET', 'http://myip.dnsomatic.com').text

            # Add our IP as a inbound rule
            response = securityGroup.authorize_ingress(CidrIp=f'{inboundIp}/32', IpProtocol='tcp', FromPort=22, ToPort=22)

            # Format the SecGroup info to show the user
            securityGroupPrint = f'{securityGroup.group_name} ({securityGroup.group_id})'
            securityGroupId = securityGroup.group_id

            print(f'{bcolors.BOLD}{bcolors.OKBLUE}Created Security Group: {securityGroupPrint}{bcolors.ENDC}\n')
        elif sec_group:
            print(f'{bcolors.OKBLUE}Attempting to find Security Group: {sec_group}{bcolors.ENDC}...')
            # Create a ec2 client
            ec2Client = boto3.client('ec2', REGION)

            # Find the sec group passed in via --sec-group
            secGroups = ec2Client.describe_security_groups(GroupNames=[sec_group])

            if len(secGroups['SecurityGroups']) == 0:
                print(f'{bcolors.FAIL}Error. No security group could be found for name: {sec_group}{bcolors.ENDC}')
                exit(1)
            if len(secGroups['SecurityGroups']) > 1:
                # This means we must have the user choose the group they want
                index = 0
                for group in secGroups['SecurityGroups']:
                    print(f'{bcolors.OKBLUE}[{index}]{bcolors.ENDC}{bcolors.OKBLUE} {group["GroupName"]}{bcolors.ENDC}')
                    index += 1
                securityGroupIndex = input(f'\n{bcolors.OKCYAN}Please select an security group: {bcolors.ENDC}\n')

                securityGroup = secGroups['SecurityGroups'][securityGroupIndex]

            else:
                # Else just pick the top 
                securityGroup = secGroups['SecurityGroups'][0]
            
            # Format the SecGroup info to show the user
            securityGroupPrint = f'{securityGroup["GroupName"]} ({securityGroup["GroupId"]})'
            securityGroupId = securityGroup["GroupId"] 
        
            print(f'{bcolors.BOLD}{bcolors.OKBLUE}Found Security Group: {securityGroupPrint}{bcolors.ENDC}\n')


    # Let the user know what will be created
    try:
        input(f'{bcolors.BOLD}{bcolors.OKBLUE}Press Enter to create the following instance:{bcolors.ENDC} \
        \n\t{bcolors.OKBLUE}* Name:{bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN} {instanceName}{bcolors.ENDC} \
        \n\t{bcolors.OKBLUE}* Instance Image:{bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN} {imageKey} ({IMAGE_ID_MAPPER[imageKey]["imageId"]}){bcolors.ENDC} \
        \n\t{bcolors.OKBLUE}* Instance Type:{bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN} {instanceType}{bcolors.ENDC} \
        \n\t{bcolors.OKBLUE}* UserData: {bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN}{userData if userData else "None"}{bcolors.ENDC} \
        \n\t{bcolors.OKBLUE}* Security Group: {bcolors.ENDC}{bcolors.BOLD}{bcolors.OKGREEN}{securityGroupPrint if securityGroupPrint else "None"}{bcolors.ENDC} \n')
    except KeyboardInterrupt:
        print(f'{bcolors.FAIL}Aborting...{bcolors.ENDC}')
        exit(0)

    print(f'{bcolors.BOLD}{bcolors.OKBLUE}Creating instance...{bcolors.ENDC}')

    # Create the instance
    kwargs = dict(
        ImageId=IMAGE_ID_MAPPER[imageKey]['imageId'],
        MinCount=1,
        MaxCount=1,
        InstanceType=instanceType,
        KeyName=KEYPAIR,
        TagSpecifications=[
            {
                'ResourceType': 'instance',
                'Tags': [
                    {
                        'Key': 'Name',
                        'Value': instanceName
                    },
                    {
                        'Key': 'AutoStop',
                        'Value': 'True'
                    }
                ]
            }
            
        ]
    )
    if securityGroupId:
        kwargs['SecurityGroupIds'] = [securityGroupId]
    if userData:
        kwargs['UserData'] = userData
    instance = ec2.create_instances(**kwargs)[0]

    # Watch the instance start
    utils.watchInstanceStart(ec2, instanceName, instance.id, ssh_config_path, ssh_key_path, ssh_host_name, imageKey=imageKey)