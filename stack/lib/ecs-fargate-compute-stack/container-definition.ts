import { Duration } from "aws-cdk-lib";
import { ContainerDefinitionProps, ContainerImage, EnvironmentFile, HealthCheck, LinuxParameters, LogDriver, PortMapping, Secret, SystemControl, TaskDefinition } from "aws-cdk-lib/aws-ecs";
import BaseStackProps from "../base-stack-props";

/**
 * Container definition
 */
 export default class TaskContainerDefinition extends BaseStackProps {

    /**
     * Default constructor
     * @param baseProps Base props
     */
    constructor(baseProps: BaseStackProps) {
        super(baseProps);
        Object.assign(this, baseProps);
    }
    
     image: ContainerImage;
     containerName?: string | undefined;
     command?: string[] | undefined;
     cpu?: number | undefined;
     disableNetworking?: boolean | undefined;
     dnsSearchDomains?: string[] | undefined;
     dnsServers?: string[] | undefined;
     dockerLabels?: { [key: string]: string; } | undefined;
     dockerSecurityOptions?: string[] | undefined;
     entryPoint?: string[] | undefined;
     environment?: { [key: string]: string; } | undefined;
     environmentFiles?: EnvironmentFile[] | undefined;
     secrets?: { [key: string]: Secret; } | undefined;
     startTimeout?: Duration | undefined;
     stopTimeout?: Duration | undefined;
     essential?: boolean | undefined;
     extraHosts?: { [name: string]: string; } | undefined;
     healthCheck?: HealthCheck | undefined;
     hostname?: string | undefined;
     memoryLimitMiB?: number | undefined;
     memoryReservationMiB?: number | undefined;
     privileged?: boolean | undefined;
     readonlyRootFilesystem?: boolean | undefined;
     user?: string | undefined;
     workingDirectory?: string | undefined;
     logging?: LogDriver | undefined;
     linuxParameters?: LinuxParameters | undefined;
     gpuCount?: number | undefined;
     portMappings?: PortMapping[] | undefined;
     inferenceAcceleratorResources?: string[] | undefined;
     systemControls?: SystemControl[] | undefined;
}