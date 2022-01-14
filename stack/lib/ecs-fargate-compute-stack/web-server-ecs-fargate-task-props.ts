import { ISubnet, IVpc, SecurityGroup, SelectedSubnets, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { IRepository, Repository } from "aws-cdk-lib/aws-ecr";
import { DeploymentController, DeploymentControllerType, TaskDefinitionProps } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancerProps, ApplicationProtocol } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroupProps, RetentionDays } from "aws-cdk-lib/aws-logs";
import BaseStackProps from "../base-stack-props";
import TaskContainerDefinition from "./container-definition";

/**
 * ECS Fargate Cluster based web server
 */
export default class WebServerEcsFargateTaskProps extends BaseStackProps {

    public applicationLoadBalancerProps: ApplicationLoadBalancerProps;
    public applicationLoadBalancerSubnets?: SelectedSubnets | undefined;
    public containerDefinition: TaskContainerDefinition;
    public containerRepository: IRepository;
    public targetSubnets: Array<ISubnet>;   
    public taskLogGroupProps: LogGroupProps = {
        retention: RetentionDays.ONE_DAY
    };
    public vpc : IVpc;
    public webServerApplicationLoadBalancerProductionListenerPort?: number | undefined;
    public webServerApplicationLoadBalancerProductionListenerProtocol?: ApplicationProtocol | undefined;
    public webServerApplicationLoadBalancerTestListenerPort?: number | undefined;
    public webServerApplicationLoadBalancerTestListenerProtocol?: ApplicationProtocol | undefined;
    public webServerAssignPublicIp : boolean = true;
    public webServerContainerPort : number = 8080;
    public webserverDeploymentType: DeploymentControllerType = DeploymentControllerType.ECS;
    public webserverExternalDeploymentController?: DeploymentController;
    public webServerDesiredTaskCount: number = 0;
    public webServerHealthCheckPath: string = "/";
    public webServerMaxDesiredTaskCount: number = 2;
    public webServerMinDesiredTaskCount: number = 1;
    public webServerTaskDefinitionProps: TaskDefinitionProps;
    public webServerTaskName: string;
    public webServerTaskSubnets: SelectedSubnets;

    /**
     * Default constructor
     * @param baseProps Base props
     */
    constructor(baseProps: BaseStackProps) {
        super(baseProps);
        Object.assign(this, baseProps);
    }
}