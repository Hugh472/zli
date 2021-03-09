import click

from zli_dev.scripts import getTokenHandler, buildEc2Handler, startInstanceHandler

@click.group(invoke_without_command=True)
def cli():
    pass

@cli.command('getToken')
@click.option('--zli-path', 'zli_path', envvar='ZLI_PATH', default=None, help='Custom path to use for zli executable')
@click.option('--configName', 'config_name', envvar='ZLI_CONFIG_NAME', default='prod', help='Config file to use [prod, stage, dev]')
def getToken(zli_path, config_name):
    getTokenHandler(zli_path, config_name)

@cli.command('ec2')
@click.option('-startInstance', 'startinstance', is_flag=True, help='Start a EC2 instance (must pass --instance-name)')
@click.option('-buildEc2', 'buildec2', is_flag=True, help='Interactive tool to build EC2 instance')
@click.option('--sec-group', 'sec_group', envvar='EC2_SECURITY_GROUP', default=None, help='Custom security name to find or create')
@click.option('--ssh-config-path', 'ssh_config_path', envvar='SSH_CONFIG_PATH', default=None, help='SSH Config path to update ssh information')
@click.option('--ssh-key-path', 'ssh_key_path', envvar='SSH_KEY_PATH', default=None, help='SSH Key path to use when updating SSH Config')
@click.option('--ssh-host-name', 'ssh_host_name', envvar='SSH_HOST_NAME', help='Optional SSH Host name to use for config')
@click.option('--instance-name', 'instance_name', envvar='INSTANCE_NAME', help='Instance \'Name\' tag value')
def ec2(startinstance, buildec2, sec_group, ssh_config_path, ssh_key_path, ssh_host_name, instance_name):
    if startinstance:
        if not instance_name:
            raise Exception('Missing argument --instance-name')
        startInstanceHandler(instance_name, ssh_config_path, ssh_key_path, ssh_host_name)
    elif buildec2:
        buildEc2Handler(sec_group, ssh_config_path, ssh_key_path, ssh_host_name)
