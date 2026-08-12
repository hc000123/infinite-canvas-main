package service

import "context"

type requestMetaContextKey struct{}
type RequestMeta struct {
	IPAddress, UserAgent, DeviceName, SessionID, LoginApprovalID string
	IPAllowed                                                    bool
}

func WithRequestMeta(ctx context.Context, meta RequestMeta) context.Context {
	return context.WithValue(ctx, requestMetaContextKey{}, meta)
}
func RequestMetaFromContext(ctx context.Context) RequestMeta {
	meta, _ := ctx.Value(requestMetaContextKey{}).(RequestMeta)
	return meta
}
