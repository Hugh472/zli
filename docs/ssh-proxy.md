#  Using SSH ProxyCommand

Setup ssh config to use thoum to proxy ssh commands for hosts that start with `bzero-`

```config
host bzero-*
  IdentityFile ~/.ssh/cwc-jan2020.pem
  ProxyCommand <path-to-thoum-executable> --configName=dev ssh-proxy %h %r %p ~/.ssh/cwc-jan2020.pem
```

+ Current limitation is that the target's sshd must allow ssh connections for the public key in `IdentityFile` otherwise you will get permission denied.

Then try connecting using ssh 

```bash
ssh <user>@bzero-<targetId> -v
```

+ To get the targetId of the server use `thoum --configName=dev list-targets`
+ Only ssm targets are supported