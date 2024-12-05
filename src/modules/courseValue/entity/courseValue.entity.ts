import {
  BaseEntity,
  Column,
  Entity, JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CoursesEntity } from '../../courses/entity/courses.entity';
import { DeadlineEntity } from '../../deadline/entity/deadline.entity';
import { SchedulerTemplateEntity } from '../../schedulerTemplate/entity/schedulerTemplate.entity';

@Entity('course_value')
export class CourseValueEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'course_value_id' })
  id: number;

  @Column({ name: 'lecture', nullable: false })
  lecture: string;

  @Column({ name: 'location', nullable: false })
  location: string;

  @ManyToOne(() => CoursesEntity, (courses) => courses.courseValues, {onDelete: 'CASCADE'})
  courses: CoursesEntity;

  @ManyToOne(() => SchedulerTemplateEntity, (scheduler) => scheduler.courseValues)
  @JoinColumn({ name: 'schedulerId' })
  scheduler: SchedulerTemplateEntity;

  @OneToMany(() => DeadlineEntity, (deadline) => deadline.courseValue)
  deadlines: DeadlineEntity[];
}
