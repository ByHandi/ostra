package service

import (
	"context"

	"github.com/ByHandi/ostra/control/internal/garage"
)

type DomainCounts struct {
	Active  int `json:"active"`
	Pending int `json:"pending"`
	Error   int `json:"error"`
}

type Overview struct {
	Cluster garage.ClusterHealth `json:"cluster"`
	Buckets int                  `json:"buckets"`
	Objects int64                `json:"objects"`
	Bytes   int64                `json:"bytes"`
	Keys    int                  `json:"keys"`
	Domains DomainCounts         `json:"domains"`
}

func (s *Service) Overview(ctx context.Context) (Overview, error) {
	var out Overview

	health, err := s.garage.Health(ctx)
	if err != nil {
		return out, err
	}
	out.Cluster = health

	buckets, err := s.ListBuckets(ctx)
	if err != nil {
		return out, err
	}
	out.Buckets = len(buckets)
	for _, b := range buckets {
		out.Objects += b.Objects
		out.Bytes += b.Bytes
	}

	keys, err := s.ListKeys(ctx)
	if err != nil {
		return out, err
	}
	out.Keys = len(keys)

	domains, err := s.q.ListDomains(ctx)
	if err != nil {
		return out, err
	}
	for _, d := range domains {
		switch d.Status {
		case StatusActive:
			out.Domains.Active++
		case StatusPending:
			out.Domains.Pending++
		case StatusError:
			out.Domains.Error++
		}
	}
	return out, nil
}
