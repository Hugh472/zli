package bzhttp

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"time"

	lggr "bastionzero.com/bctl/v1/bzerolib/logger"
	backoff "github.com/cenkalti/backoff/v4"
)

func Post(endpoint string, contentType string, body []byte, logger *lggr.Logger) (*http.Response, error) {
	// Helper function to perform exponential backoff on http post requests

	// Define our exponential backoff params
	params := backoff.NewExponentialBackOff()
	params.MaxElapsedTime = time.Hour * 8 // Wait in total at most 8 hours

	return post(endpoint, contentType, body, params, logger)

}

func PostRegister(endpoint string, contentType string, body []byte, logger *lggr.Logger) (*http.Response, error) {
	// For the registration post request, we set different parameters for our exponential backoff

	// Define our exponential backoff params
	params := backoff.NewExponentialBackOff()
	params.MaxElapsedTime = time.Hour * 4 // Wait in total at most 4 hours
	params.MaxInterval = time.Hour        // At most 1 hour in between requests

	return post(endpoint, contentType, body, params, logger)
}

func post(endpoint string, contentType string, body []byte, params *backoff.ExponentialBackOff, logger *lggr.Logger) (*http.Response, error) {
	// Default params
	// Ref: https://github.com/cenkalti/backoff/blob/a78d3804c2c84f0a3178648138442c9b07665bda/exponential.go#L76
	// DefaultInitialInterval     = 500 * time.Millisecond
	// DefaultRandomizationFactor = 0.5
	// DefaultMultiplier          = 1.5
	// DefaultMaxInterval         = 60 * time.Second
	// DefaultMaxElapsedTime      = 15 * time.Minute

	// Make our ticker
	ticker := backoff.NewTicker(params)

	// Keep looping through our ticker, waiting for it to tell us when to retry
	for range ticker.C {
		var httpClient = &http.Client{
			Timeout: time.Second * 10,
		}
		response, err := httpClient.Post(endpoint, contentType, bytes.NewBuffer(body))

		// If the status code is unauthorized, do not attempt to retry
		if response.StatusCode == http.StatusInternalServerError || response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusNotFound {
			ticker.Stop()
			return response, fmt.Errorf("received response code: %d, not retrying", response.StatusCode)
		}

		if err != nil || response.StatusCode != http.StatusOK {
			logger.Info(fmt.Sprintf("error making post request, will retry in: %s.", params.NextBackOff()))
			continue
		}

		ticker.Stop()
		return response, err
	}

	return nil, errors.New("unable to make post request")
}
