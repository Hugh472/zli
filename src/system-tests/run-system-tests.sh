#!/bin/bash
set -e

if [ "$AWS_ENV" == "prod" ]; then
    # In the production account pipeline we run our system tests against cloud-staging
    CONFIG_NAME="stage"
    ENV="prod"
else
    CONFIG_NAME="dev"
    ENV="dev"
fi

CONFIG_DIR="/system-test"
PROJECT_NAME="bastionzero-zli"
mkdir -p "${CONFIG_DIR}/${PROJECT_NAME}"

# If IDPS_TO_TEST is not provided default to running all idps
if [[ -z "${IDPS_TO_TEST}" ]]; then
  IDPS_TO_TEST="google okta microsoft"
fi

run_system_test() {
    # Downloads a role account zli configuration file from s3 that is pre-logged and
    # can be used to run system tests without an interactive login step
    bzero-qa zli -download --filepath "${CONFIG_DIR}/${PROJECT_NAME}/${CONFIG_NAME}.json" --idp $1 --env $ENV

    # Export custom configuration directory to use for the system test
    export ZLI_CONFIG_DIR=$CONFIG_DIR
    export ZLI_CONFIG_NAME=$CONFIG_NAME
    npm run system-test
}

# Run system tests for each idp
for idp in $IDPS_TO_TEST
do
   echo "Running system tests with idp = $idp"
   run_system_test $idp
done