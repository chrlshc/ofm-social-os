import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Alert,
  AlertIcon,
  Card,
  CardHeader,
  CardBody,
  Grid,
  GridItem,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Progress,
  Switch,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  Tooltip,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import {
  FiPlay,
  FiPause,
  FiStop,
  FiRefreshCw,
  FiSettings,
  FiShield,
  FiActivity,
  FiDatabase,
  FiServer,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiUsers,
  FiTrendingUp,
  FiTrendingDown,
  FiEdit,
  FiTrash2,
} from 'react-icons/fi';

// Types for admin console
interface DeploymentStatus {
  version: string;
  environment: string;
  phase: 'healthy' | 'progressing' | 'degraded' | 'unknown';
  canaryWeight: number;
  replicas: {
    desired: number;
    ready: number;
    updated: number;
  };
  lastUpdate: string;
}

interface SLOMetric {
  name: string;
  current: number;
  target: number;
  status: 'pass' | 'fail' | 'unknown';
  trend: 'improving' | 'degrading' | 'stable';
}

interface SystemHealth {
  api: 'healthy' | 'degraded' | 'down';
  database: 'healthy' | 'degraded' | 'down';
  redis: 'healthy' | 'degraded' | 'down';
  s3: 'healthy' | 'degraded' | 'down';
  overall: 'healthy' | 'degraded' | 'down';
}

interface AlertRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  condition: string;
  description: string;
  lastTriggered?: string;
}

interface UserSession {
  id: string;
  username: string;
  email: string;
  lastActive: string;
  ipAddress: string;
  platform: string;
  status: 'active' | 'inactive';
}

const AdminConsole: React.FC = () => {
  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);
  const [slos, setSlos] = useState<SLOMetric[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedAlert, setSelectedAlert] = useState<AlertRule | null>(null);

  // Mock data - replace with real API calls
  useEffect(() => {
    const loadData = () => {
      // Simulate API calls
      setDeployment({
        version: 'v1.0.0',
        environment: 'production',
        phase: 'healthy',
        canaryWeight: 10,
        replicas: {
          desired: 3,
          ready: 3,
          updated: 3,
        },
        lastUpdate: new Date().toISOString(),
      });

      setSlos([
        {
          name: 'P95 Latency',
          current: 8500,
          target: 10000,
          status: 'pass',
          trend: 'stable',
        },
        {
          name: 'Success Rate',
          current: 99.2,
          target: 95,
          status: 'pass',
          trend: 'improving',
        },
        {
          name: 'Webhook Signatures',
          current: 99.9,
          target: 99.9,
          status: 'pass',
          trend: 'stable',
        },
        {
          name: 'Error Rate',
          current: 0.8,
          target: 1,
          status: 'pass',
          trend: 'improving',
        },
      ]);

      setSystemHealth({
        api: 'healthy',
        database: 'healthy',
        redis: 'healthy',
        s3: 'healthy',
        overall: 'healthy',
      });

      setAlerts([
        {
          id: '1',
          name: 'High Error Rate',
          severity: 'critical',
          enabled: true,
          condition: 'error_rate > 1%',
          description: 'Triggers when error rate exceeds 1% for 5 minutes',
          lastTriggered: undefined,
        },
        {
          id: '2',
          name: 'High Latency',
          severity: 'warning',
          enabled: true,
          condition: 'p95_latency > 10s',
          description: 'Triggers when P95 latency exceeds 10 seconds',
          lastTriggered: '2025-08-12T10:30:00Z',
        },
        {
          id: '3',
          name: 'Database Connection Issues',
          severity: 'critical',
          enabled: true,
          condition: 'db_connections < 1',
          description: 'Triggers when database connections drop below threshold',
          lastTriggered: undefined,
        },
      ]);

      setSessions([
        {
          id: '1',
          username: 'admin',
          email: 'admin@ofm.social',
          lastActive: '2025-08-12T12:00:00Z',
          ipAddress: '192.168.1.100',
          platform: 'Web',
          status: 'active',
        },
        {
          id: '2',
          username: 'operator',
          email: 'ops@ofm.social',
          lastActive: '2025-08-12T11:45:00Z',
          ipAddress: '10.0.1.50',
          platform: 'API',
          status: 'active',
        },
      ]);

      setLoading(false);
    };

    loadData();
    
    // Auto-refresh every 30 seconds if enabled
    const interval = autoRefresh ? setInterval(loadData, 30000) : null;
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'green';
      case 'degraded':
      case 'warning':
        return 'yellow';
      case 'down':
      case 'fail':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'healthy':
        return <FiCheckCircle color="green" />;
      case 'progressing':
        return <FiClock color="blue" />;
      case 'degraded':
        return <FiAlertTriangle color="orange" />;
      default:
        return <FiAlertTriangle color="gray" />;
    }
  };

  const handleCanaryAction = (action: 'promote' | 'abort' | 'pause') => {
    toast({
      title: `Canary ${action}`,
      description: `Canary deployment ${action} initiated`,
      status: 'info',
      duration: 3000,
    });
    // Implement actual canary actions here
  };

  const handleAlertToggle = (alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, enabled: !alert.enabled }
          : alert
      )
    );
  };

  const handleSessionTerminate = (sessionId: string) => {
    setSessions(prev => prev.filter(session => session.id !== sessionId));
    toast({
      title: 'Session Terminated',
      description: 'User session has been terminated',
      status: 'success',
      duration: 3000,
    });
  };

  if (loading) {
    return (
      <Box p={8}>
        <Text>Loading admin console...</Text>
      </Box>
    );
  }

  return (
    <Box p={6} maxW="1400px" mx="auto">
      <HStack justify="space-between" mb={6}>
        <VStack align="start" spacing={1}>
          <Text fontSize="3xl" fontWeight="bold">
            OFM Social OS Admin Console
          </Text>
          <Text color="gray.600">
            Production Environment - v{deployment?.version}
          </Text>
        </VStack>
        
        <HStack spacing={4}>
          <HStack>
            <Text fontSize="sm">Auto-refresh</Text>
            <Switch 
              isChecked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </HStack>
          <Button 
            leftIcon={<FiRefreshCw />}
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Refresh
          </Button>
        </HStack>
      </HStack>

      <Tabs variant="enclosed" colorScheme="blue">
        <TabList>
          <Tab>🚀 Deployment</Tab>
          <Tab>📊 SLOs</Tab>
          <Tab>🏥 Health</Tab>
          <Tab>🚨 Alerts</Tab>
          <Tab>👥 Sessions</Tab>
          <Tab>🔧 Operations</Tab>
        </TabList>

        <TabPanels>
          {/* Deployment Tab */}
          <TabPanel>
            <Grid templateColumns="repeat(3, 1fr)" gap={6}>
              <GridItem colSpan={2}>
                <Card>
                  <CardHeader>
                    <HStack justify="space-between">
                      <HStack>
                        <Text fontSize="xl" fontWeight="semibold">
                          Canary Deployment Status
                        </Text>
                        {getPhaseIcon(deployment?.phase || 'unknown')}
                      </HStack>
                      <Badge 
                        colorScheme={getStatusColor(deployment?.phase || 'unknown')}
                        fontSize="md"
                      >
                        {deployment?.phase?.toUpperCase()}
                      </Badge>
                    </HStack>
                  </CardHeader>
                  <CardBody>
                    <VStack spacing={4} align="stretch">
                      <HStack justify="space-between">
                        <Text>Canary Traffic Weight:</Text>
                        <HStack>
                          <Progress 
                            value={deployment?.canaryWeight} 
                            max={100} 
                            colorScheme="blue" 
                            w="200px" 
                          />
                          <Text fontWeight="bold">{deployment?.canaryWeight}%</Text>
                        </HStack>
                      </HStack>
                      
                      <HStack justify="space-between">
                        <Text>Replicas:</Text>
                        <Text>
                          {deployment?.replicas.ready}/{deployment?.replicas.desired} ready
                          ({deployment?.replicas.updated} updated)
                        </Text>
                      </HStack>
                      
                      <HStack justify="space-between">
                        <Text>Last Update:</Text>
                        <Text>{new Date(deployment?.lastUpdate || '').toLocaleString()}</Text>
                      </HStack>

                      <HStack spacing={3} mt={4}>
                        <Button 
                          leftIcon={<FiPlay />} 
                          colorScheme="green" 
                          size="sm"
                          onClick={() => handleCanaryAction('promote')}
                        >
                          Promote
                        </Button>
                        <Button 
                          leftIcon={<FiPause />} 
                          colorScheme="yellow" 
                          size="sm"
                          onClick={() => handleCanaryAction('pause')}
                        >
                          Pause
                        </Button>
                        <Button 
                          leftIcon={<FiStop />} 
                          colorScheme="red" 
                          size="sm"
                          onClick={() => handleCanaryAction('abort')}
                        >
                          Abort
                        </Button>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card>
                  <CardHeader>
                    <Text fontSize="xl" fontWeight="semibold">
                      Quick Stats
                    </Text>
                  </CardHeader>
                  <CardBody>
                    <VStack spacing={4}>
                      <Stat>
                        <StatLabel>Active Users</StatLabel>
                        <StatNumber>1,234</StatNumber>
                        <StatHelpText>
                          <StatArrow type="increase" />
                          12.5%
                        </StatHelpText>
                      </Stat>
                      
                      <Stat>
                        <StatLabel>Posts/Hour</StatLabel>
                        <StatNumber>856</StatNumber>
                        <StatHelpText>
                          <StatArrow type="increase" />
                          8.2%
                        </StatHelpText>
                      </Stat>
                      
                      <Stat>
                        <StatLabel>Success Rate</StatLabel>
                        <StatNumber>99.2%</StatNumber>
                        <StatHelpText>
                          <StatArrow type="increase" />
                          0.1%
                        </StatHelpText>
                      </Stat>
                    </VStack>
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>
          </TabPanel>

          {/* SLOs Tab */}
          <TabPanel>
            <Grid templateColumns="repeat(2, 1fr)" gap={6}>
              {slos.map((slo) => (
                <Card key={slo.name}>
                  <CardBody>
                    <HStack justify="space-between" mb={4}>
                      <Text fontSize="lg" fontWeight="semibold">
                        {slo.name}
                      </Text>
                      <Badge colorScheme={getStatusColor(slo.status)}>
                        {slo.status.toUpperCase()}
                      </Badge>
                    </HStack>
                    
                    <VStack spacing={3} align="stretch">
                      <HStack justify="space-between">
                        <Text>Current:</Text>
                        <Text fontWeight="bold">
                          {slo.name.includes('Rate') 
                            ? `${slo.current}%`
                            : slo.name.includes('Latency')
                            ? `${slo.current}ms`
                            : slo.current
                          }
                        </Text>
                      </HStack>
                      
                      <HStack justify="space-between">
                        <Text>Target:</Text>
                        <Text>
                          {slo.name.includes('Rate') 
                            ? `${slo.target}%`
                            : slo.name.includes('Latency')
                            ? `${slo.target}ms`
                            : slo.target
                          }
                        </Text>
                      </HStack>
                      
                      <HStack justify="space-between">
                        <Text>Trend:</Text>
                        <HStack>
                          {slo.trend === 'improving' && <FiTrendingUp color="green" />}
                          {slo.trend === 'degrading' && <FiTrendingDown color="red" />}
                          <Text>{slo.trend}</Text>
                        </HStack>
                      </HStack>

                      <Progress 
                        value={slo.name.includes('Error') 
                          ? 100 - (slo.current / slo.target * 100)
                          : (slo.current / slo.target * 100)
                        }
                        colorScheme={getStatusColor(slo.status)}
                      />
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </Grid>
          </TabPanel>

          {/* Health Tab */}
          <TabPanel>
            <Grid templateColumns="repeat(2, 1fr)" gap={6}>
              <Card>
                <CardHeader>
                  <Text fontSize="xl" fontWeight="semibold">System Health</Text>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4}>
                    {systemHealth && Object.entries(systemHealth).map(([component, status]) => (
                      <HStack key={component} justify="space-between" w="full">
                        <HStack>
                          {component === 'api' && <FiServer />}
                          {component === 'database' && <FiDatabase />}
                          {component === 'redis' && <FiActivity />}
                          {component === 's3' && <FiShield />}
                          {component === 'overall' && <FiCheckCircle />}
                          <Text textTransform="capitalize">{component}</Text>
                        </HStack>
                        <Badge colorScheme={getStatusColor(status)}>
                          {status.toUpperCase()}
                        </Badge>
                      </HStack>
                    ))}
                  </VStack>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Text fontSize="xl" fontWeight="semibold">Resource Usage</Text>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    <Box>
                      <HStack justify="space-between" mb={2}>
                        <Text>CPU Usage</Text>
                        <Text>45%</Text>
                      </HStack>
                      <Progress value={45} colorScheme="blue" />
                    </Box>
                    
                    <Box>
                      <HStack justify="space-between" mb={2}>
                        <Text>Memory Usage</Text>
                        <Text>62%</Text>
                      </HStack>
                      <Progress value={62} colorScheme="green" />
                    </Box>
                    
                    <Box>
                      <HStack justify="space-between" mb={2}>
                        <Text>Disk Usage</Text>
                        <Text>34%</Text>
                      </HStack>
                      <Progress value={34} colorScheme="yellow" />
                    </Box>
                    
                    <Box>
                      <HStack justify="space-between" mb={2}>
                        <Text>Network I/O</Text>
                        <Text>28%</Text>
                      </HStack>
                      <Progress value={28} colorScheme="purple" />
                    </Box>
                  </VStack>
                </CardBody>
              </Card>
            </Grid>
          </TabPanel>

          {/* Alerts Tab */}
          <TabPanel>
            <Card>
              <CardHeader>
                <HStack justify="space-between">
                  <Text fontSize="xl" fontWeight="semibold">Alert Rules</Text>
                  <Button leftIcon={<FiSettings />} size="sm">
                    Configure
                  </Button>
                </HStack>
              </CardHeader>
              <CardBody>
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Name</Th>
                      <Th>Severity</Th>
                      <Th>Condition</Th>
                      <Th>Status</Th>
                      <Th>Last Triggered</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {alerts.map((alert) => (
                      <Tr key={alert.id}>
                        <Td>{alert.name}</Td>
                        <Td>
                          <Badge colorScheme={alert.severity === 'critical' ? 'red' : 'yellow'}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                        </Td>
                        <Td fontFamily="mono" fontSize="sm">
                          {alert.condition}
                        </Td>
                        <Td>
                          <Switch 
                            isChecked={alert.enabled}
                            onChange={() => handleAlertToggle(alert.id)}
                          />
                        </Td>
                        <Td>
                          {alert.lastTriggered 
                            ? new Date(alert.lastTriggered).toLocaleString()
                            : 'Never'
                          }
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            <Tooltip label="Edit">
                              <IconButton
                                aria-label="Edit"
                                icon={<FiEdit />}
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  onOpen();
                                }}
                              />
                            </Tooltip>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </TabPanel>

          {/* Sessions Tab */}
          <TabPanel>
            <Card>
              <CardHeader>
                <Text fontSize="xl" fontWeight="semibold">Active Sessions</Text>
              </CardHeader>
              <CardBody>
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>User</Th>
                      <Th>Email</Th>
                      <Th>Platform</Th>
                      <Th>IP Address</Th>
                      <Th>Last Active</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sessions.map((session) => (
                      <Tr key={session.id}>
                        <Td fontWeight="semibold">{session.username}</Td>
                        <Td>{session.email}</Td>
                        <Td>{session.platform}</Td>
                        <Td fontFamily="mono">{session.ipAddress}</Td>
                        <Td>{new Date(session.lastActive).toLocaleString()}</Td>
                        <Td>
                          <Badge colorScheme={session.status === 'active' ? 'green' : 'gray'}>
                            {session.status.toUpperCase()}
                          </Badge>
                        </Td>
                        <Td>
                          <Tooltip label="Terminate Session">
                            <IconButton
                              aria-label="Terminate"
                              icon={<FiTrash2 />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleSessionTerminate(session.id)}
                            />
                          </Tooltip>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </TabPanel>

          {/* Operations Tab */}
          <TabPanel>
            <Grid templateColumns="repeat(2, 1fr)" gap={6}>
              <Card>
                <CardHeader>
                  <Text fontSize="xl" fontWeight="semibold">System Operations</Text>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    <Button leftIcon={<FiDatabase />} variant="outline">
                      Database Backup
                    </Button>
                    <Button leftIcon={<FiRefreshCw />} variant="outline">
                      Restart Services
                    </Button>
                    <Button leftIcon={<FiShield />} variant="outline">
                      Security Scan
                    </Button>
                    <Button leftIcon={<FiActivity />} variant="outline">
                      Performance Test
                    </Button>
                  </VStack>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Text fontSize="xl" fontWeight="semibold">Maintenance Mode</Text>
                </CardHeader>
                <CardBody>
                  <Alert status="info" mb={4}>
                    <AlertIcon />
                    Maintenance mode will temporarily disable the API
                  </Alert>
                  
                  <VStack spacing={4} align="stretch">
                    <HStack justify="space-between">
                      <Text>Maintenance Mode</Text>
                      <Switch />
                    </HStack>
                    
                    <Select placeholder="Select maintenance duration">
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="120">2 hours</option>
                    </Select>
                    
                    <Button colorScheme="orange" variant="outline">
                      Schedule Maintenance
                    </Button>
                  </VStack>
                </CardBody>
              </Card>
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Alert Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Alert Rule</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedAlert && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="semibold" mb={2}>Name</Text>
                  <Text>{selectedAlert.name}</Text>
                </Box>
                <Box>
                  <Text fontWeight="semibold" mb={2}>Description</Text>
                  <Text>{selectedAlert.description}</Text>
                </Box>
                <Box>
                  <Text fontWeight="semibold" mb={2}>Condition</Text>
                  <Text fontFamily="mono" fontSize="sm">
                    {selectedAlert.condition}
                  </Text>
                </Box>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={onClose}>
              Save Changes
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default AdminConsole;