import { IVpc } from "aws-cdk-lib/aws-ec2";
import { CloudMapNamespaceOptions } from "aws-cdk-lib/aws-ecs";
import BaseStackProps from "../base-stack-props";

/**
 * Compute Stack props
 */
export default class EcsFargateComputeStackProps extends BaseStackProps {

    public defaultCloudMapNamespaceOptions? : CloudMapNamespaceOptions | undefined;
    public clusterName?: string | undefined;
    public containerInsights? : boolean | undefined;
    public targetVpc: IVpc;
    public terminationProtection?: boolean | undefined;

    /**
     * Default constructor
     * @param baseProps Base props
     */
    constructor(baseProps: BaseStackProps) {
        super(baseProps);
        Object.assign(this, baseProps);
    }
}