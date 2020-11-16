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