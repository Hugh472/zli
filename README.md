# thoum

First time set up:
 - Generate an API key for your desired server 
 - Edit `src/index.js` for the `serviceUrl` and `apiSecret`
 - run `npm run start config`

How to use:

```
npm run start connect <SSM | SSH> <TARGET-ID>
```

To quit: `CTRL+Q`


Some notes:
 - If you get random 500 errors you might have used up all your session allocation (limit of 10 per user), just drop the `sessions` table's rows (`psql -c "delete from sessions *" WebshellDb`)


TODO:
 - Add oauth flow
 - Add inquirer for dynamic config set up
 - Add error handling
 - Add more features such as listing and reconnecting


 ## CLI Release Process

 We use [pkg](https://github.com/vercel/pkg) to package the node.js application into a single executable that can be run even without node or any npm dependencies are installed. The target executables can be configured in the `package.json` file for different OSs as documented [here](https://github.com/vercel/pkg#targets) but the default is to build windows, mac, and linux executable for the current node.js version and arch. Use `npm run release` to package the app and output executables to a `bin` directory.

 The release process is triggered via a codebuild job: [webshell-cli-release](https://console.aws.amazon.com/codesuite/codebuild/238681891460/projects/webshell-cli-release) which installs/builds the app, generates the executables (the codebuild job currently uses a nodejs version 12 runtime [here](https://github.com/cwcrypto/thoum/blob/f581e921b7b25d69d7765284824f63e84fd7d197/webshell-cli-release.yml#L11)). This codebuild job is configured to publish the release artifacts to the s3 bucket [webshell-cli-release](https://s3.console.aws.amazon.com/s3/buckets/webshell-cli-release). There is also a [cloudfront distribution](https://console.aws.amazon.com/cloudfront/home?region=us-east-1#distribution-settings:EI221CXMRD3VL) setup with the CNAME `download-cli.clunk80.com` configured with the s3 bucket as an origin.

### Release Versioning

The executables will be published to the s3 bucket with 2 different path prefixes each time the codebuild job is run:

1. `webshell-cli-release/release/latest/`

2. `webshell-cli-release/release/{version}`

Where {version} is the version that is defined in the `package.json` file. This means older versions are still accessible but the `latest` folder will always overwritten by the codebuild job.