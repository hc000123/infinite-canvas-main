"use client";

import { Segmented, Space, Typography } from "antd";

import { DataCenterDistribution } from "./components/data-center-distribution";
import { DataCenterOverview } from "./components/data-center-overview";
import { DataCenterRecords } from "./components/data-center-records";
import { dataCenterScopeOptions } from "./data-center-view";
import { useDataCenter } from "./use-data-center";

export default function DataCenterPage() {
    const dataCenter = useDataCenter();
    const scopeOptions = dataCenterScopeOptions(dataCenter.role);
    return (
        <main className="studio-shell h-full min-h-0 overflow-y-auto px-4 py-5 md:px-6 xl:px-7">
            <div className="mx-auto max-w-[1440px]">
                <header className="studio-page-header flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                    <div>
                        <Typography.Title level={2} style={{ margin: 0 }}>
                            数据中心
                        </Typography.Title>
                        <Typography.Text type="secondary">查看算力消耗、使用分布与消费记录</Typography.Text>
                    </div>
                    {scopeOptions.length ? <Segmented value={dataCenter.scope} options={scopeOptions} onChange={dataCenter.setScope} /> : null}
                </header>
                <Space orientation="vertical" size={24} style={{ display: "flex", marginTop: 16 }}>
                    <DataCenterOverview
                        balance={dataCenter.balance}
                        periods={dataCenter.summary?.periods}
                        period={dataCenter.period}
                        loading={dataCenter.summaryLoading}
                        error={dataCenter.summaryError}
                        onPeriodChange={dataCenter.setPeriod}
                        onRetry={() => void dataCenter.retrySummary()}
                    />
                    <DataCenterDistribution scope={dataCenter.scope} summary={dataCenter.summary} loading={dataCenter.summaryLoading} />
                    <DataCenterRecords
                        scope={dataCenter.scope}
                        filters={dataCenter.filters}
                        data={dataCenter.records}
                        loading={dataCenter.recordsLoading}
                        error={dataCenter.recordsError}
                        onFiltersChange={dataCenter.updateFilters}
                        onRetry={() => void dataCenter.retryRecords()}
                    />
                </Space>
            </div>
        </main>
    );
}
