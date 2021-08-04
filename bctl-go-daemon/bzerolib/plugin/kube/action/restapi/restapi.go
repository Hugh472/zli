package restapi

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
)

type RestApiAction struct {
	serviceAccountToken string
	kubeHost            string
	impersonateGroup    string
}

func NewRestApiAction(serviceAccountToken string, kubeHost string, impersonateGroup string) (*RestApiAction, error) {
	return &RestApiAction{
		serviceAccountToken: serviceAccountToken,
		kubeHost:            kubeHost,
		impersonateGroup:    impersonateGroup,
	}, nil
}

func (r *RestApiAction) InputMessageHandler(action string, actionPayload string) (interface{}, error) {
	log.Printf("Recieved Rest API action")
	// apiRequest, ok := actionPayload.(KubeRestApiActionPayload)
	// if !ok {
	// 	return KubeRestApiActionResponsePayload{}, fmt.Errorf("Recieved malformed action payload %+v", actionPayload)
	// }
	var apiRequest KubeRestApiActionPayload
	if err := json.Unmarshal([]byte(actionPayload), &apiRequest); err != nil {
		return KubeRestApiActionResponsePayload{}, fmt.Errorf("Malformed Keysplitting Action payload %+v", actionPayload)
	}

	// Perform the api request
	httpClient := &http.Client{}
	kubeApiUrl := r.kubeHost + apiRequest.Endpoint
	bodyBytesReader := bytes.NewReader([]byte(apiRequest.Body))
	req, _ := http.NewRequest(apiRequest.Method, kubeApiUrl, bodyBytesReader)

	// Add any headers
	for name, values := range apiRequest.Headers {
		// Loop over all values for the name.
		req.Header.Set(name, values)
	}

	// Add our impersonation and token headers
	req.Header.Set("Authorization", "Bearer "+r.serviceAccountToken)
	req.Header.Set("Impersonate-User", apiRequest.Role)
	req.Header.Set("Impersonate-Group", r.impersonateGroup)

	// Make the request and wait for the body to close
	log.Printf("Making request for %s", kubeApiUrl)

	// TODO: Figure out a way around this
	// CA certs can be found here /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
	http.DefaultTransport.(*http.Transport).TLSClientConfig = &tls.Config{InsecureSkipVerify: true}

	res, err := httpClient.Do(req)
	// TODO: Check for error here
	if err != nil {
		return KubeRestApiActionResponsePayload{}, fmt.Errorf("Bad Response to Api request")
	}
	defer res.Body.Close()

	// Build the header response
	header := make(map[string]string)
	for key, value := range res.Header {
		// TODO: This does not seem correct, we should add all headers even if they are dups
		header[key] = value[0]
	}

	// Parse out the body
	bodyBytes, _ := ioutil.ReadAll(res.Body)

	// Now we need to send that data back to the client
	return KubeRestApiActionResponsePayload{
		StatusCode: res.StatusCode,
		RequestId:  apiRequest.RequestId,
		Headers:    header,
		Content:    bodyBytes,
	}, nil
}
