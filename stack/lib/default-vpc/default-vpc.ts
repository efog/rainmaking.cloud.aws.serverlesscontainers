import { Stack } from "aws-cdk-lib";
import { FlowLogDestination, FlowLogTrafficType, ISubnet, IVpc, SelectedSubnets, SubnetSelection, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import defaultVpcProps from "./default-vpc-props";

import * as debug from "debug";
const trace = debug("TRACE:ServerlessContainersStack:DefaultVpc");
const info = debug("INFO:ServerlessContainersStack:DefaultVpc");
const warn = debug("WARN:ServerlessContainersStack:DefaultVpc");
const error = debug("ERROR:ServerlessContainersStack:DefaultVpc");

export default class DefaultVpc extends Stack {

    public flowlogsRole: Role;
    public privateSubnets: SelectedSubnets | undefined;
    public publicSubnets: SelectedSubnets | undefined;
    public vpc: IVpc;

    /**
     * Default constructor
     * @param scope Parent stack scope
     * @param id stack id
     * @param props stack props
     */
    constructor(scope: Construct, id: string, props: defaultVpcProps) {
        super(scope, id, props);
        trace(`starting creation of VPC`);
        this.flowlogsRole = new Role(this, "flowLogsRole", {
            "assumedBy": new ServicePrincipal("vpc-flow-logs.amazonaws.com"),
            "description": "Role allowing flow logs output to cloudwatch",
            "inlinePolicies": {
                "loggingPolicy": new PolicyDocument({
                    "statements": [
                        new PolicyStatement({
                            "actions": ["logs:CreateLogGroup",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                                "logs:DescribeLogGroups",
                                "logs:DescribeLogStreams"],
                            "effect": Effect.ALLOW,
                            "resources": ["*"]
                        })
                    ]
                })
            }
        });
        trace(`created flow logs role`);

        trace(`creating flow logs log group`);
        const flowLogsLogGroup = new LogGroup(this, "vpcFlowLogsLogGroup", {
            "retention": RetentionDays.ONE_DAY
        });
        trace(`created flow logs log group`);

        trace(`creating vpc`);
        this.vpc = new Vpc(this, "appVpc", {
            "cidr": "10.0.0.0/16",
            "enableDnsHostnames": true,
            "maxAzs": Stack.of(this).availabilityZones.length,
            "subnetConfiguration": [{
                "cidrMask": 24,
                "subnetType": SubnetType.PUBLIC,
                "name": "app-subnet"
            }],
            "enableDnsSupport": true,
            "flowLogs": {
                "flowLogs": {
                    "destination": FlowLogDestination.toCloudWatchLogs(flowLogsLogGroup, this.flowlogsRole),
                    "trafficType": FlowLogTrafficType.REJECT
                }
            }
        });
        this.publicSubnets = {
            "subnetIds": this.vpc.publicSubnets.map((subnet) => {
                trace(`subnet id ${subnet.subnetId}`);
                return subnet.subnetId
            }),
            "subnets": this.vpc.publicSubnets,
            "internetConnectivityEstablished": true,
            "hasPublic": true,
            "availabilityZones": this.vpc.publicSubnets.map((subnet)=> {
                trace(`az ${subnet.availabilityZone}`);
                return subnet.availabilityZone
            })
        };
        
        trace(`created vpc`);
    }
}